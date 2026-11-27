// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

let db: PGlite;

async function freshDb() {
  const pg = new PGlite();
  await pg.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) {
    await pg.exec(read(join("migrations", file)));
  }
  await pg.exec(read("seed.sql"));
  return pg;
}

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

beforeEach(async () => {
  db = await freshDb();
}, 30_000);

afterEach(async () => {
  await db.close();
});

describe("migrations and sample data", () => {
  it("load cleanly, and running the seed twice adds nothing", async () => {
    await db.exec(read("seed.sql"));
    const counts = await one<{ c: number; p: number; t: number }>(
      "select (select count(*)::int from contacts) c, (select count(*)::int from properties) p, (select count(*)::int from tickets) t",
    );
    expect(counts).toEqual({ c: 4, p: 5, t: 5 });
  });

  it("numbers tickets from 1001 and logs a created event for each", async () => {
    const r = await one<{ min: string; events: number }>(
      "select min(number)::text min, (select count(*)::int from ticket_events where kind = 'created') events from tickets",
    );
    expect(r).toEqual({ min: "1001", events: 5 });
  });

  it("turns on row-level security for every table", async () => {
    const { rows } = await db.query<{ relname: string }>(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity",
    );
    expect(rows).toEqual([]);
  });
});

describe("contacts", () => {
  it("normalizes phone numbers and lowercases emails", async () => {
    const r = await one<{ phone_digits: string; email: string }>(
      "insert into contacts (first_name, phone, email) values ('Sam', '+1 (302) 555-0100', '  Sam@Example.COM ') returning phone_digits, email",
    );
    expect(r).toEqual({ phone_digits: "3025550100", email: "sam@example.com" });
  });

  it("rejects a contact with no name and a malformed email", async () => {
    await expect(db.query("insert into contacts (first_name) values ('  ')")).rejects.toThrow(/contacts_has_name/);
    await expect(db.query("insert into contacts (first_name, email) values ('Sam', 'sam@')")).rejects.toThrow(/contacts_email_shape/);
  });

  it("allows only one primary property per customer", async () => {
    await expect(
      db.query(
        "insert into properties (contact_id, street, city, is_primary) values ('00000000-0000-4000-a000-000000000001', '1 Main St', 'Dover', true)",
      ),
    ).rejects.toThrow(/properties_one_primary/);
  });
});

describe("tickets", () => {
  const lead = "00000000-0000-4000-c000-000000000004"; // Fence repair, at lead

  it("follows the stage rules and records each move", async () => {
    await db.query("update tickets set stage = 'estimating' where id = $1", [lead]);
    await db.query("update tickets set stage = 'estimate_sent' where id = $1", [lead]);
    const { rows } = await db.query<{ from_stage: string; to_stage: string }>(
      "select from_stage, to_stage from ticket_events where ticket_id = $1 and kind = 'stage_changed' order by created_at, id",
      [lead],
    );
    expect(rows.map((r) => `${r.from_stage}>${r.to_stage}`).sort()).toEqual(["estimating>estimate_sent", "lead>estimating"]);
  });

  it("refuses to skip stages", async () => {
    await expect(db.query("update tickets set stage = 'paid' where id = $1", [lead])).rejects.toThrow(/cannot move from lead to paid/);
  });

  it("requires a reason to mark a ticket lost, and clears it on reopen", async () => {
    await expect(db.query("update tickets set stage = 'lost' where id = $1", [lead])).rejects.toThrow(/tickets_lost_needs_reason/);
    await db.query("update tickets set stage = 'lost', lost_reason = 'Price' where id = $1", [lead]);
    await db.query("update tickets set stage = 'lead' where id = $1", [lead]);
    expect(await one("select stage, lost_reason from tickets where id = $1", [lead])).toEqual({ stage: "lead", lost_reason: null });
  });

  it("starts real tickets at an early stage only", async () => {
    await expect(
      db.query("insert into tickets (contact_id, title, stage) values ('00000000-0000-4000-a000-000000000004', 'Gutters', 'scheduled')"),
    ).rejects.toThrow(/New tickets start at/);
  });

  it("rejects a property that belongs to a different customer", async () => {
    await expect(
      db.query(
        "insert into tickets (contact_id, property_id, title) values ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000001', 'Gutters')",
      ),
    ).rejects.toThrow(/does not belong to contact/);
  });

  it("logs which fields changed", async () => {
    await db.query("update tickets set estimated_value = 950, title = 'Fence repair, 6 pickets' where id = $1", [lead]);
    const ev = await one<{ data: Record<string, { from: unknown; to: unknown }> }>(
      "select data from ticket_events where ticket_id = $1 and kind = 'updated'",
      [lead],
    );
    expect(ev.data.estimated_value.to).toBe(950);
    expect(ev.data.title).toEqual({ from: "Fence repair", to: "Fence repair, 6 pickets" });
  });

  it("offers Mark lost from every open stage", async () => {
    const r = await one<{ n: number }>("select count(*)::int n from ticket_stage_transitions where to_stage = 'lost'");
    expect(r.n).toBe(10);
  });
});
