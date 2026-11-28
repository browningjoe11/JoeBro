// @vitest-environment node
// Checks the O1 crews and technicians tables: shape rules, the calendar link, and who can see and change them.
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

const DECK = "00000000-0000-4000-f000-000000000001";
const REMODEL = "00000000-0000-4000-f000-000000000003";
const MIKE = "00000000-0000-4000-f100-000000000001";

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

describe("crews table", () => {
  it("loads three sample crews and gives the bathroom bookings to the remodel crew", async () => {
    const r = await db.query<{ name: string; color: string; day_start: string }>("select name, color, day_start::text from crews order by sort");
    expect(r.rows.map((c) => [c.name, c.color])).toEqual([
      ["Deck crew", "teal"],
      ["Siding crew", "orange"],
      ["Remodel crew", "purple"],
    ]);
    expect(r.rows[0].day_start).toBe("07:00:00");
    const ev = await db.query<{ n: number }>("select count(*)::int n from calendar_events where crew_id = $1", [REMODEL]);
    expect(ev.rows[0].n).toBe(2);
  });

  it("needs a name, a unique name, a palette color, a working day and an end after the start", async () => {
    await expect(db.query("insert into crews (name) values ('  ')")).rejects.toThrow(/crews_name_present/);
    await expect(db.query("insert into crews (name) values (' deck CREW ')")).rejects.toThrow(/crews_unique_name/);
    await expect(db.query("insert into crews (name, color) values ('X', '#ff0000')")).rejects.toThrow(/crews_color_known/);
    await expect(db.query("insert into crews (name, work_days) values ('X', '{}')")).rejects.toThrow(/crews_work_days_valid/);
    await expect(db.query("insert into crews (name, work_days) values ('X', '{1,7}')")).rejects.toThrow(/crews_work_days_valid/);
    await expect(db.query("insert into crews (name, day_start, day_end) values ('X', '15:00', '07:00')")).rejects.toThrow(/crews_hours_order/);
    const r = await db.query<{ color: string; work_days: number[] }>("insert into crews (name) values ('Defaults') returning color, work_days");
    expect(r.rows[0]).toEqual({ color: "teal", work_days: [1, 2, 3, 4, 5] });
  });

  it("only links a booking to a real crew, and keeps bookings and techs when a crew is deleted", async () => {
    await expect(
      db.query("insert into calendar_events (title, starts_at, ends_at, crew_id) values ('X', now(), now() + interval '1 hour', gen_random_uuid())"),
    ).rejects.toThrow(/calendar_events_crew_id_fkey/);
    const crew = await db.query<{ id: string }>("insert into crews (name) values ('Temp crew') returning id");
    const id = crew.rows[0].id;
    const ev = await db.query<{ id: string }>(
      "insert into calendar_events (title, starts_at, ends_at, crew_id) values ('Temp', now(), now() + interval '1 hour', $1) returning id",
      [id],
    );
    await db.query("insert into technicians (full_name, crew_id) values ('Temp tech', $1)", [id]);
    await db.query("delete from crews where id = $1", [id]);
    expect((await db.query("select crew_id from calendar_events where id = $1", [ev.rows[0].id])).rows[0]).toEqual({ crew_id: null });
    expect((await db.query("select crew_id from technicians where full_name = 'Temp tech'")).rows[0]).toEqual({ crew_id: null });
  });

  it("links one app login to at most one tech", async () => {
    await db.query("update technicians set profile_id = $1 where id = $2", [USERS.technician, MIKE]);
    await expect(db.query("insert into technicians (full_name, profile_id) values ('Twin', $1)", [USERS.technician])).rejects.toThrow(
      /technicians_profile_id_key/,
    );
    await expect(db.query("insert into technicians (full_name) values ('')")).rejects.toThrow(/technicians_name_present/);
  });
});

describe("crew access", () => {
  it("everyone switched on sees crews and techs; newcomers and visitors don't", async () => {
    for (const who of ["admin", "sales", "operations", "technician", "reviewer"] as const) {
      await as(who, async (tx) => {
        expect(await count(tx, "crews"), who).toBeGreaterThanOrEqual(3);
        expect(await count(tx, "technicians"), who).toBeGreaterThanOrEqual(5);
      });
    }
    await as("newcomer", async (tx) => {
      expect(await count(tx, "crews")).toBe(0);
      expect(await count(tx, "technicians")).toBe(0);
    });
    await expect(as("anon", (tx) => count(tx, "crews"))).rejects.toThrow(/permission denied/);
  });

  it("admins and operations add and change crews and techs; only admins delete", async () => {
    for (const who of ["admin", "operations"] as const) {
      await as(who, async (tx) => {
        expect(await changed(tx, "insert into crews (name, color) values ('Fence crew', 'green')")).toBe(1);
        expect(await changed(tx, "update crews set color = 'red' where id = $1", [DECK])).toBe(1);
        expect(await changed(tx, "insert into technicians (full_name, crew_id) values ('New tech', $1)", [DECK])).toBe(1);
        expect(await changed(tx, "update technicians set phone = '302-555-0000' where id = $1", [MIKE])).toBe(1);
      });
    }
    await as("operations", async (tx) => {
      expect(await changed(tx, "delete from technicians where id = $1", [MIKE])).toBe(0);
      expect(await changed(tx, "delete from crews where id = $1", [DECK])).toBe(0);
    });
    await as("admin", async (tx) => {
      expect(await changed(tx, "delete from technicians where id = $1", [MIKE])).toBe(1);
    });
    for (const who of ["sales", "technician", "reviewer"] as const) {
      await expect(as(who, (tx) => changed(tx, "insert into crews (name) values ('Nope')")), who).rejects.toThrow(/row-level security/);
      await expect(as(who, (tx) => changed(tx, "insert into technicians (full_name) values ('Nope')")), who).rejects.toThrow(/row-level security/);
      await as(who, async (tx) => {
        expect(await changed(tx, "update crews set color = 'red' where id = $1", [DECK])).toBe(0);
        expect(await changed(tx, "update technicians set phone = 'x' where id = $1", [MIKE])).toBe(0);
      });
    }
  });
});
