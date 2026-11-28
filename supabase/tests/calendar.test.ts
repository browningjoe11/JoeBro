// @vitest-environment node
// Checks the S8 calendar table: shape rules, sample rows, and who can see and change events.
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

const BATH = "00000000-0000-4000-c000-000000000003";
const SUPPLIER = "00000000-0000-4000-d000-000000000001";
const SITE_VISIT = "00000000-0000-4000-d000-000000000002";

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
  // The technician has the bathroom job, and is personally booked on the siding visit.
  await db.query("update tickets set stage = 'scheduled', assigned_to = $1 where id = $2", [USERS.technician, BATH]);
  await db.query("update calendar_events set assigned_to = $1 where id = $2", [USERS.technician, SITE_VISIT]);
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

const titles = (tx: Transaction) =>
  tx.query<{ id: string }>("select id from calendar_events order by id").then((r) => r.rows.map((x) => x.id));
const changed = (tx: Transaction, sql: string, params: unknown[] = []) => tx.query(sql, params).then((r) => r.affectedRows ?? 0);
const insertEvent = "insert into calendar_events (title, starts_at, ends_at) values ('Test', now(), now() + interval '1 hour')";

describe("calendar events table", () => {
  it("loads five sample bookings inside the current week", async () => {
    const r = await db.query<{ n: number; outside: number }>(`
      select count(*)::int n,
             count(*) filter (where starts_at < date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'
                               or starts_at >= (date_trunc('week', now() at time zone 'America/New_York') + interval '7 days') at time zone 'America/New_York')::int outside
      from calendar_events where is_example`);
    expect(r.rows[0]).toEqual({ n: 5, outside: 0 });
  });

  it("needs a title, an end after the start, and a palette color", async () => {
    await expect(db.query("insert into calendar_events (title, starts_at, ends_at) values ('  ', now(), now() + interval '1 hour')")).rejects.toThrow(
      /calendar_events_title_present/,
    );
    await expect(db.query("insert into calendar_events (title, starts_at, ends_at) values ('X', now(), now())")).rejects.toThrow(
      /calendar_events_ends_after_start/,
    );
    await expect(
      db.query("insert into calendar_events (title, starts_at, ends_at, color) values ('X', now(), now() + interval '1 hour', '#ff0000')"),
    ).rejects.toThrow(/calendar_events_color_known/);
  });

  it("defaults to a confirmed 'other' booking and keeps the event when its ticket is deleted", async () => {
    const r = await db.query<{ id: string; kind: string; status: string }>(
      `insert into calendar_events (title, starts_at, ends_at, ticket_id) values ('Walkthrough', now(), now() + interval '1 hour', $1)
       returning id, kind, status`,
      ["00000000-0000-4000-c000-000000000005"],
    );
    expect(r.rows[0]).toMatchObject({ kind: "other", status: "confirmed" });
    await db.query("delete from tickets where id = '00000000-0000-4000-c000-000000000005'");
    const after = await db.query<{ ticket_id: string | null }>("select ticket_id from calendar_events where id = $1", [r.rows[0].id]);
    expect(after.rows[0].ticket_id).toBeNull();
  });
});

describe("calendar access", () => {
  it("office roles see every event; technicians see only theirs; others see none", async () => {
    for (const who of ["admin", "sales", "operations", "reviewer"] as const) {
      expect((await as(who, titles)).length).toBeGreaterThanOrEqual(5);
    }
    expect(await as("technician", titles)).toEqual([
      SITE_VISIT, // assigned to them
      "00000000-0000-4000-d000-000000000003", // their bathroom ticket
      "00000000-0000-4000-d000-000000000004",
    ]);
    expect(await as("newcomer", titles)).toEqual([]);
    await expect(as("anon", titles)).rejects.toThrow(/permission denied/);
  });

  it("admin, sales and operations add, move and delete; technicians and reviewers can't", async () => {
    for (const who of ["admin", "sales", "operations"] as const) {
      await as(who, async (tx) => {
        expect(await changed(tx, insertEvent)).toBe(1);
        expect(
          await changed(tx, "update calendar_events set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1", [
            SUPPLIER,
          ]),
        ).toBe(1);
        expect(await changed(tx, "delete from calendar_events where id = $1", [SUPPLIER])).toBe(1);
      });
    }
    for (const who of ["technician", "reviewer"] as const) {
      await expect(as(who, (tx) => changed(tx, insertEvent))).rejects.toThrow(/row-level security/);
      await as(who, async (tx) => {
        expect(await changed(tx, "update calendar_events set title = 'Moved' where id = $1", [SITE_VISIT])).toBe(0);
        expect(await changed(tx, "delete from calendar_events where id = $1", [SITE_VISIT])).toBe(0);
      });
    }
  });
});
