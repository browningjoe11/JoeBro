// @vitest-environment node
// Checks the S3 estimate tables: version numbering, the ticket's value, and who can see and change estimates.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

const USERS = {
  admin: "10000000-0000-4000-8000-000000000001",
  sales: "10000000-0000-4000-8000-000000000002",
  operations: "10000000-0000-4000-8000-000000000003",
  technician: "10000000-0000-4000-8000-000000000004",
  reviewer: "10000000-0000-4000-8000-000000000005",
  newcomer: "10000000-0000-4000-8000-000000000006",
} as const;
type Who = keyof typeof USERS;

const DECK = "00000000-0000-4000-c000-000000000001";
let estimateId: string;

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
  await db.query("update tickets set assigned_to = $1 where id = $2", [USERS.technician, DECK]);
  const r = await db.query<{ id: string }>("insert into estimates (ticket_id, title, total) values ($1, 'Deck estimate', 1200) returning id", [DECK]);
  estimateId = r.rows[0].id;
}, 30_000);

afterAll(async () => {
  await db.close();
});

async function as<R>(who: Who | "anon", fn: (tx: Transaction) => Promise<R>): Promise<R> {
  let result!: R;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      if (who === "anon") {
        await tx.exec("set local role anon");
      } else {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [USERS[who]]);
      }
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

const count = (tx: Transaction, table: string) => tx.query<{ n: number }>(`select count(*)::int n from ${table}`).then((r) => r.rows[0].n);
const changed = (tx: Transaction, sql: string, params: unknown[] = []) => tx.query(sql, params).then((r) => r.affectedRows ?? 0);
const saveVersion = (tx: Transaction | PGlite, total: number) =>
  tx.query<{ version: number }>(
    "insert into estimate_versions (estimate_id, version, title, lines, total) values ($1, 0, 'Deck estimate', '{}'::jsonb, $2) returning version",
    [estimateId, total],
  );

describe("estimate tables", () => {
  it("starts an estimate with empty lines and no versions", async () => {
    const r = await db.query<{ lines: unknown; version_count: number; notes: string }>("select lines, version_count, notes from estimates where id = $1", [estimateId]);
    expect(r.rows[0]).toEqual({ lines: { labor: [], materials: [], adders: [], multipliers: [] }, version_count: 0, notes: "" });
  });

  it("needs a ticket, a title, an object of lines and a total of $0 or more", async () => {
    await expect(db.query("insert into estimates (ticket_id) values (gen_random_uuid())")).rejects.toThrow(/estimates_ticket_id_fkey/);
    await expect(db.query("insert into estimates (ticket_id, title) values ($1, ' ')", [DECK])).rejects.toThrow(/estimates_title_present/);
    await expect(db.query("insert into estimates (ticket_id, lines) values ($1, '[]')", [DECK])).rejects.toThrow(/estimates_lines_shape/);
    await expect(db.query("insert into estimates (ticket_id, total) values ($1, -1)", [DECK])).rejects.toThrow(/estimates_total_positive/);
  });

  it("numbers versions 1, 2, 3 whatever the app sends, and sets the ticket's value", async () => {
    await as("sales", async (tx) => {
      expect((await saveVersion(tx, 1500)).rows[0].version).toBe(1);
      expect((await saveVersion(tx, 1750.25)).rows[0].version).toBe(2);
      const e = await tx.query<{ version_count: number }>("select version_count from estimates where id = $1", [estimateId]);
      expect(e.rows[0].version_count).toBe(2);
      const t = await tx.query<{ estimated_value: string }>("select estimated_value::text from tickets where id = $1", [DECK]);
      expect(t.rows[0].estimated_value).toBe("1750.25");
      const ev = await tx.query<{ data: Record<string, { to: unknown }> }>(
        "select data from ticket_events where ticket_id = $1 and kind = 'updated' order by created_at desc, id desc limit 1",
        [DECK],
      );
      expect(Number(ev.rows[0].data.estimated_value.to)).toBe(1750.25);
    });
  });

  it("never changes or deletes a saved version, and deleting an estimate removes its versions", async () => {
    await as("admin", async (tx) => {
      await saveVersion(tx, 900);
      await expect(tx.query("update estimate_versions set total = 1")).rejects.toThrow(/permission denied/);
    });
    await as("admin", async (tx) => {
      await saveVersion(tx, 900);
      await expect(tx.query("delete from estimate_versions")).rejects.toThrow(/permission denied/);
    });
    await as("admin", async (tx) => {
      await saveVersion(tx, 900);
      expect(await changed(tx, "delete from estimates where id = $1", [estimateId])).toBe(1);
      expect(await count(tx, "estimate_versions")).toBe(0);
    });
  });
});

describe("estimate access", () => {
  it("office roles read estimates; technicians, newcomers and visitors don't", async () => {
    for (const who of ["admin", "sales", "operations", "reviewer"] as const) {
      await as(who, async (tx) => expect(await count(tx, "estimates"), who).toBe(1));
    }
    for (const who of ["technician", "newcomer"] as const) {
      await as(who, async (tx) => {
        expect(await count(tx, "estimates"), who).toBe(0);
        expect(await count(tx, "estimate_versions"), who).toBe(0);
      });
    }
    await expect(as("anon", (tx) => count(tx, "estimates"))).rejects.toThrow(/permission denied/);
  });

  it("sales and admins write drafts and save versions; only admins delete", async () => {
    for (const who of ["admin", "sales"] as const) {
      await as(who, async (tx) => {
        expect(await changed(tx, "insert into estimates (ticket_id, title) values ($1, 'Option B')", [DECK])).toBe(1);
        expect(await changed(tx, "update estimates set notes = 'Pressure-treated frame' where id = $1", [estimateId])).toBe(1);
        expect((await saveVersion(tx, 10)).rows[0].version).toBe(1);
      });
    }
    await as("sales", async (tx) => expect(await changed(tx, "delete from estimates where id = $1", [estimateId])).toBe(0));
    for (const who of ["operations", "reviewer", "technician"] as const) {
      await as(who, async (tx) => {
        expect(await changed(tx, "update estimates set notes = 'x' where id = $1", [estimateId]), who).toBe(0);
        await expect(tx.query("insert into estimates (ticket_id) values ($1)", [DECK]), who).rejects.toThrow(/row-level security/);
      });
      await expect(as(who, (tx) => saveVersion(tx, 1)), who).rejects.toThrow(/row-level security/);
    }
  });
});
