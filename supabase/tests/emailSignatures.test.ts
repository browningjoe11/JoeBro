// @vitest-environment node
// Checks the S5 email_signatures table: shape rules and that people only see and change their own (admins any).
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

const USERS = {
  admin: "10000000-0000-4000-8000-000000000001",
  sales: "10000000-0000-4000-8000-000000000002",
  technician: "10000000-0000-4000-8000-000000000004",
  newcomer: "10000000-0000-4000-8000-000000000006",
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
  for (const role of ["sales", "technician"] as const) {
    await db.query("update profiles set role = $1, active = true where id = $2", [role, USERS[role]]);
  }
  await db.query("insert into email_signatures (profile_id, full_name) values ($1, 'Sally Sales')", [USERS.sales]);
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

const names = (tx: Transaction) =>
  tx.query<{ full_name: string }>("select full_name from email_signatures order by full_name").then((r) => r.rows.map((x) => x.full_name));
const insert = (tx: Transaction, who: Who, name: string) =>
  tx.query("insert into email_signatures (profile_id, full_name) values ($1, $2)", [USERS[who], name]);

describe("email signatures table", () => {
  it("starts with sensible switches and rejects a blank name, bad email or unknown color", async () => {
    const r = await db.query<Record<string, unknown>>("select * from email_signatures where profile_id = $1", [USERS.sales]);
    expect(r.rows[0]).toMatchObject({ accent: "teal", show_logo: true, show_license: true, show_address: false });
    await expect(db.query("insert into email_signatures (profile_id, full_name) values ($1, ' ')", [USERS.admin])).rejects.toThrow(
      /email_signatures_name_present/,
    );
    await expect(
      db.query("insert into email_signatures (profile_id, full_name, email) values ($1, 'A', 'nope')", [USERS.admin]),
    ).rejects.toThrow(/email_signatures_email_shape/);
    await expect(
      db.query("insert into email_signatures (profile_id, full_name, accent) values ($1, 'A', 'pink')", [USERS.admin]),
    ).rejects.toThrow(/email_signatures_accent_known/);
  });

  it("adds an email logo address to the company profile", async () => {
    const r = await db.query<{ email_logo_url: string | null }>("select email_logo_url from company_settings");
    expect(r.rows[0].email_logo_url).toBeNull();
  });

  it("lets people see and save only their own signature", async () => {
    expect(await as("sales", names)).toEqual(["Sally Sales"]);
    expect(await as("technician", names)).toEqual([]);
    await as("technician", async (tx) => {
      await insert(tx, "technician", "Tom Tech");
      expect(await names(tx)).toEqual(["Tom Tech"]);
    });
    await expect(as("technician", (tx) => insert(tx, "sales", "Not me"))).rejects.toThrow(/row-level security/);
    const changed = await as("technician", (tx) =>
      tx.query("update email_signatures set title = 'x' where profile_id = $1", [USERS.sales]).then((r) => r.affectedRows),
    );
    expect(changed).toBe(0);
  });

  it("lets an admin see and set up anyone's", async () => {
    expect(await as("admin", names)).toEqual(["Sally Sales"]);
    await as("admin", async (tx) => {
      await insert(tx, "technician", "Tom Tech");
      const r = await tx.query("update email_signatures set title = 'Estimator' where profile_id = $1", [USERS.sales]);
      expect(r.affectedRows).toBe(1);
    });
  });

  it("gives an account that isn't switched on nothing", async () => {
    expect(await as("newcomer", names)).toEqual([]);
    await expect(as("newcomer", (tx) => insert(tx, "newcomer", "New Person"))).rejects.toThrow(/row-level security/);
  });
});
