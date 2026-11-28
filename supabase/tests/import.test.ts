// @vitest-environment node
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

const USERS = {
  admin: "10000000-0000-4000-8000-000000000001",
  sales: "10000000-0000-4000-8000-000000000002",
} as const;

const DANA = "00000000-0000-4000-a000-000000000001";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.exec(read("seed.sql"));
  for (const [who, id] of Object.entries(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${who}@example.com`]);
  }
  await db.query("update profiles set role = 'sales', active = true where id = $1", [USERS.sales]);
}, 30_000);

afterAll(async () => {
  await db.close();
});

async function as<R>(who: keyof typeof USERS | "anon", fn: (tx: Transaction) => Promise<R>): Promise<R> {
  let result!: R;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      if (who === "anon") await tx.exec("set local role anon");
      else {
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

describe("crm import rules", () => {
  it("lets an imported job start later than a new lead, and still requires a lost reason", async () => {
    const row = await db.query<{ stage: string }>(
      `insert into tickets (contact_id, title, stage, import_source, import_key)
       values ($1, 'Example imported job', 'scheduled', 'joebros-crm', 'test-scheduled')
       returning stage`,
      [DANA],
    );
    expect(row.rows[0].stage).toBe("scheduled");
    await expect(
      db.query(
        `insert into tickets (contact_id, title, stage, import_source, import_key)
         values ($1, 'Plain job', 'scheduled', null, null)`,
        [DANA],
      ),
    ).rejects.toThrow(/lead, site_visit or estimating/);
    await expect(
      db.query(
        `insert into tickets (contact_id, title, stage, import_source, import_key)
         values ($1, 'Example lost job', 'lost', 'joebros-crm', 'test-lost')`,
        [DANA],
      ),
    ).rejects.toThrow(/tickets_lost_needs_reason/);
  });

  it("refuses a second copy of the same export id", async () => {
    await expect(
      db.query(
        `insert into contacts (first_name, import_source, import_key) values ('Example', 'joebros-crm', 'test-scheduled-contact')`,
      ),
    ).resolves.toBeTruthy();
    await expect(
      db.query(
        `insert into contacts (first_name, import_source, import_key) values ('Example again', 'joebros-crm', 'test-scheduled-contact')`,
      ),
    ).rejects.toThrow(/contacts_import_key/);
  });

  it("lets an admin record an imported note and a link, and stops everyone else", async () => {
    const ticket = await db.query<{ id: string }>("select id from tickets where import_key = 'test-scheduled'");
    const ticketId = ticket.rows[0].id;
    await expect(
      as("admin", (tx) =>
        tx.query(
          `insert into ticket_events (ticket_id, kind, data, import_source, import_key)
           values ($1, 'note', '{"text":"Example imported note"}', 'joebros-crm', 'test-note')`,
          [ticketId],
        ),
      ),
    ).resolves.toBeTruthy();
    await expect(
      as("sales", (tx) =>
        tx.query(
          `insert into ticket_events (ticket_id, kind, data, import_source, import_key)
           values ($1, 'note', '{"text":"nope"}', 'joebros-crm', 'test-note-sales')`,
          [ticketId],
        ),
      ),
    ).rejects.toThrow(/row-level security|Only an admin/);
    await expect(
      as("admin", (tx) =>
        tx.query(
          `insert into import_links (source, entity, import_key, record_id, matched_existing)
           values ('joebros-crm', 'contact', 'legacy-1', $1, true)`,
          [DANA],
        ),
      ),
    ).resolves.toBeTruthy();
    await expect(
      as("sales", (tx) =>
        tx.query(
          `insert into import_links (source, entity, import_key, record_id)
           values ('joebros-crm', 'contact', 'legacy-2', $1)`,
          [DANA],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(as("sales", (tx) => tx.query("select * from import_links"))).resolves.toMatchObject({ rows: [] });
    await expect(
      as("sales", (tx) =>
        tx.query(
          `insert into contacts (first_name, import_source, import_key) values ('Sales', 'joebros-crm', 'sales-try')`,
        ),
      ),
    ).rejects.toThrow(/Only an admin/);
  });

  it("still lets sales edit an imported customer without changing the source tag", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into contacts (first_name, last_name, import_source, import_key)
       values ('Imported', 'Example', 'joebros-crm', 'edit-me') returning id`,
    );
    await db.query(
      `insert into tickets (contact_id, title, stage, import_source, import_key)
       values ($1, 'Example lead from the old CRM', 'lead', 'joebros-crm', 'edit-me-job')`,
      [rows[0].id],
    );
    const changed = await as("sales", async (tx) => {
      const name = await tx.query("update contacts set phone = '302-555-0199' where id = $1", [rows[0].id]);
      let stamp = "";
      try {
        await tx.query("update contacts set import_source = null, import_key = null where id = $1", [rows[0].id]);
      } catch (e) {
        stamp = e instanceof Error ? e.message : String(e);
      }
      return { name: name.affectedRows ?? 0, stamp };
    });
    expect(changed.name).toBe(1);
    expect(changed.stamp).toMatch(/Only an admin/);
  });
});
