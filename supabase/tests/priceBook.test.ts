// @vitest-environment node
// Checks the S1 price book table: admins edit it, estimating roles read it,
// technicians don't see prices, and each kind of item holds the right numbers.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

const USERS = {
  admin: "30000000-0000-4000-8000-000000000001",
  sales: "30000000-0000-4000-8000-000000000002",
  operations: "30000000-0000-4000-8000-000000000003",
  technician: "30000000-0000-4000-8000-000000000004",
  reviewer: "30000000-0000-4000-8000-000000000005",
} as const;
type Who = keyof typeof USERS;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.exec(read("seed.sql"));
  for (const [who, id] of Object.entries(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${who}@example.com`]);
  }
  for (const role of ["sales", "operations", "technician", "reviewer"] as const) {
    await db.query("update profiles set role = $1, active = true where id = $2", [role, USERS[role]]);
  }
}, 30_000);

afterAll(async () => {
  await db.close();
});

async function as<R>(who: Who, fn: (tx: Transaction) => Promise<R>): Promise<R> {
  let result!: R;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [USERS[who]]);
      try {
        result = await fn(tx);
      } catch (e) {
        failure = e;
      }
      await tx.rollback();
    })
    .catch(() => {});
  if (failure) throw failure;
  return result;
}

const count = (tx: Transaction, sql: string) => tx.query<{ n: number }>(sql).then((r) => r.rows[0].n);
const changed = (tx: Transaction, sql: string) => tx.query(sql).then((r) => r.affectedRows ?? 0);

describe("price book", () => {
  it("ships example items of every kind", async () => {
    const { rows } = await db.query<{ kind: string }>("select distinct kind::text from price_items where is_example order by 1");
    expect(rows.map((r) => r.kind)).toEqual(["labor", "material", "adder", "multiplier"].sort());
  });

  it("lets estimating roles read it and hides it from technicians", async () => {
    for (const who of ["admin", "sales", "operations", "reviewer"] as const) {
      expect(await as(who, (tx) => count(tx, "select count(*)::int n from price_items")), who).toBeGreaterThan(0);
    }
    expect(await as("technician", (tx) => count(tx, "select count(*)::int n from price_items"))).toBe(0);
  });

  it("only lets admins add, edit and retire items", async () => {
    const add = "insert into price_items (kind, name, unit, price) values ('labor', 'Roofer', 'hr', 70)";
    await expect(as("sales", (tx) => tx.query(add))).rejects.toThrow(/row-level security/);
    await expect(as("admin", (tx) => tx.query(add))).resolves.toBeTruthy();
    expect(await as("sales", (tx) => changed(tx, "update price_items set price = 1 where kind = 'labor'"))).toBe(0);
    expect(await as("admin", (tx) => changed(tx, "update price_items set active = false where name = 'Helper'"))).toBe(1);
  });

  it("never deletes items, so estimates keep their history", async () => {
    await expect(as("admin", (tx) => tx.query("delete from price_items where name = 'Helper'"))).rejects.toThrow(/permission denied/);
  });

  it("checks each kind holds the right numbers", async () => {
    const bad = [
      ["labor without a rate", "insert into price_items (kind, name, unit) values ('labor', 'X', 'hr')", /price_items_price_shape/],
      ["negative cost", "insert into price_items (kind, name, unit, price) values ('material', 'X', 'ea', -1)", /price_items_price_shape/],
      ["markup on labor", "insert into price_items (kind, name, unit, price, markup_pct) values ('labor', 'X', 'hr', 50, 10)", /price_items_markup_shape/],
      ["multiplier without a factor", "insert into price_items (kind, name, applies_to) values ('multiplier', 'X', 'labor')", /price_items_factor_shape/],
      ["multiplier on nothing", "insert into price_items (kind, name, factor) values ('multiplier', 'X', 1.1)", /price_items_factor_shape/],
      ["blank name", "insert into price_items (kind, name, unit, price) values ('adder', '  ', 'job', 10)", /price_items_name/],
    ] as const;
    for (const [what, sql, err] of bad) await expect(db.query(sql), what).rejects.toThrow(err);
  });

  it("allows one active item per name, and reusing a retired item's name", async () => {
    await expect(db.query("insert into price_items (kind, name, unit, price) values ('labor', ' carpenter ', 'hr', 80)")).rejects.toThrow(
      /price_items_unique_active_name/,
    );
    await as("admin", async (tx) => {
      await tx.query("update price_items set active = false where name = 'Painter'");
      await tx.query("insert into price_items (kind, name, unit, price) values ('labor', 'Painter', 'hr', 65)");
    });
  });
});
