// @vitest-environment node
// Checks the C2 change log: editing a customer from anywhere is logged, every ticket sees the new
// details, and only people who may see the customer can read the log.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

const USERS = {
  admin: "10000000-0000-4000-8000-000000000001",
  sales: "10000000-0000-4000-8000-000000000002",
  technician: "10000000-0000-4000-8000-000000000004",
  reviewer: "10000000-0000-4000-8000-000000000005",
} as const;
type Who = keyof typeof USERS;

const ELAINE = "00000000-0000-4000-a000-000000000003";
const ELAINE_RENTAL = "00000000-0000-4000-b000-000000000004";
const DANA = "00000000-0000-4000-a000-000000000001";
const BATH = "00000000-0000-4000-c000-000000000003"; // Elaine's rental bathroom

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.exec(read("seed.sql"));
  for (const [who, id] of Object.entries(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${who}@example.com`]);
  }
  for (const role of ["sales", "technician", "reviewer"] as const) {
    await db.query("update profiles set role = $1, active = true where id = $2", [role, USERS[role]]);
  }
  await db.query("update tickets set stage = 'scheduled', assigned_to = $1 where id = $2", [USERS.technician, BATH]);
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

type Change = { actor_id: string | null; property_id: string | null; changes: Record<string, { from: unknown; to: unknown }> };
const log = (tx: Transaction, contactId: string) =>
  tx
    .query<Change>("select actor_id, property_id, changes from contact_changes where contact_id = $1 order by created_at", [contactId])
    .then((r) => r.rows);

describe("contact change log", () => {
  it("logs a phone change once, with who made it and the old and new number", async () => {
    await as("sales", async (tx) => {
      await tx.query("update contacts set phone = '302-555-0199', notes = 'irrelevant' where id = $1", [ELAINE]);
      expect(await log(tx, ELAINE)).toEqual([
        { actor_id: USERS.sales, property_id: null, changes: { phone: { from: "302.555.0119", to: "302-555-0199" } } },
      ]);
    });
  });

  it("every ticket for the customer reads the new number", async () => {
    await as("sales", async (tx) => {
      await tx.query("update contacts set phone = '302-555-0199' where id = $1", [ELAINE]);
      const r = await tx.query<{ number: number; phone: string }>(
        "select t.number, c.phone from tickets t join contacts c on c.id = t.contact_id where t.contact_id = $1 order by t.number",
        [ELAINE],
      );
      expect(r.rows).toEqual([
        { number: 1003, phone: "302-555-0199" },
        { number: 1005, phone: "302-555-0199" },
      ]);
    });
  });

  it("logs job site edits and new sites, but not saves that change nothing", async () => {
    await as("admin", async (tx) => {
      await tx.query("update properties set street = '29 Delaware Ave', zip = '19971' where id = $1", [ELAINE_RENTAL]);
      await tx.query("update contacts set phone = phone where id = $1", [ELAINE]);
      await tx.query("insert into properties (contact_id, street, city) values ($1, '1 Main St', 'Dover')", [DANA]);
      expect(await log(tx, ELAINE)).toEqual([
        { actor_id: USERS.admin, property_id: ELAINE_RENTAL, changes: { street: { from: "27 Delaware Ave", to: "29 Delaware Ave" } } },
      ]);
      const dana = await log(tx, DANA);
      expect(dana).toHaveLength(1);
      expect(dana[0].changes).toEqual({ site_added: { from: null, to: "1 Main St, Dover" } });
    });
  });

  it("a brand-new customer's first site is not logged as a change", async () => {
    const r = await db.query<{ id: string }>("insert into contacts (first_name) values ('Newbie') returning id");
    await db.query("insert into properties (contact_id, street, city) values ($1, '5 Oak St', 'Milford')", [r.rows[0].id]);
    expect((await db.query("select 1 from contact_changes where contact_id = $1", [r.rows[0].id])).rows).toEqual([]);
  });

  it("technicians and reviewers can't change contact details, so nothing is logged", async () => {
    for (const who of ["technician", "reviewer"] as const) {
      await as(who, async (tx) => {
        const r = await tx.query("update contacts set phone = '000' where id = $1", [ELAINE]);
        expect(r.affectedRows ?? 0).toBe(0);
      });
    }
  });

  it("the log is readable only where the customer is, and can't be written directly", async () => {
    await db.query("update contacts set email = 'elaine@example.org' where id = $1", [ELAINE]);
    await db.query("update contacts set email = 'dana@example.org' where id = $1", [DANA]);
    const seen = (tx: Transaction) =>
      tx.query<{ contact_id: string }>("select distinct contact_id from contact_changes order by contact_id").then((r) => r.rows.map((x) => x.contact_id));
    expect(await as("reviewer", seen)).toEqual(expect.arrayContaining([DANA, ELAINE]));
    // The technician only works Elaine's bathroom job, so only sees her log.
    expect(await as("technician", seen)).toEqual([ELAINE]);
    await expect(
      as("admin", (tx) => tx.query("insert into contact_changes (contact_id, changes) values ($1, '{\"x\":1}')", [DANA])),
    ).rejects.toThrow(/permission denied|row-level security/);
  });
});
