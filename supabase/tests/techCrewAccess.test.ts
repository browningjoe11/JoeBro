// @vitest-environment node
// Checks M1's access rule: a technician whose login is linked to a crew sees that crew's
// bookings, the tickets they're for, and those customers, but nothing else.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

const TECH = "10000000-0000-4000-8000-000000000004";
const OPS = "10000000-0000-4000-8000-000000000003";
const ROSA = "00000000-0000-4000-f100-000000000004"; // remodel crew
const MIKE = "00000000-0000-4000-f100-000000000001"; // deck crew
const BATH = "00000000-0000-4000-c000-000000000003";
const BATH_CUSTOMER = "00000000-0000-4000-a000-000000000003";
const BATH_DAY_1 = "00000000-0000-4000-d000-000000000003";
const BATH_DAY_2 = "00000000-0000-4000-d000-000000000004";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.exec(read("seed.sql"));
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.com')", ["10000000-0000-4000-8000-000000000001"]);
  await db.query("insert into auth.users (id, email) values ($1, 'tech@example.com'), ($2, 'ops@example.com')", [TECH, OPS]);
  await db.query("update profiles set role = 'technician', active = true where id = $1", [TECH]);
  await db.query("update profiles set role = 'operations', active = true where id = $1", [OPS]);
  await db.query("update tickets set stage = 'scheduled' where id = $1", [BATH]);
}, 30_000);

afterAll(async () => {
  await db.close();
});

/** Runs fn as the tech after `setup` (as the database owner), then rolls everything back. */
async function asTech<R>(setup: string, fn: (tx: Transaction) => Promise<R>, user = TECH): Promise<R> {
  let result!: R;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      if (setup) await tx.exec(setup);
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
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

const ids = (tx: Transaction, table: string) =>
  tx.query<{ id: string }>(`select id from ${table} order by id`).then((r) => r.rows.map((x) => x.id));
const link = (tech: string) => `update technicians set profile_id = '${TECH}' where id = '${tech}';`;

describe("technicians and their crew's work", () => {
  it("a tech with no crew link sees none of the crew's bookings", async () => {
    await asTech("", async (tx) => {
      expect(await ids(tx, "calendar_events")).toEqual([]);
      expect(await ids(tx, "tickets")).toEqual([]);
      expect(await ids(tx, "contacts")).toEqual([]);
    });
  });

  it("a tech on the remodel crew sees its bookings, the ticket and the customer", async () => {
    await asTech(link(ROSA), async (tx) => {
      expect(await ids(tx, "calendar_events")).toEqual([BATH_DAY_1, BATH_DAY_2]);
      expect(await ids(tx, "tickets")).toEqual([BATH]);
      expect(await ids(tx, "contacts")).toEqual([BATH_CUSTOMER]);
      const sites = await tx.query<{ street: string }>("select street from properties order by street");
      expect(sites.rows.map((r) => r.street)).toContain("27 Delaware Ave");
    });
  });

  it("a tech on another crew doesn't see the remodel crew's work", async () => {
    await asTech(link(MIKE), async (tx) => {
      expect(await ids(tx, "calendar_events")).toEqual([]);
      expect(await ids(tx, "tickets")).toEqual([]);
    });
  });

  it("a retired tech loses access", async () => {
    await asTech(`${link(ROSA)} update technicians set active = false where id = '${ROSA}';`, async (tx) => {
      expect(await ids(tx, "calendar_events")).toEqual([]);
      expect(await ids(tx, "tickets")).toEqual([]);
    });
  });

  it("the crew tech can start the job (scheduled to onsite) but still can't move bookings", async () => {
    await asTech(link(ROSA), async (tx) => {
      const moved = await tx.query("update tickets set stage = 'onsite' where id = $1", [BATH]);
      expect(moved.affectedRows).toBe(1);
      const booking = await tx.query("update calendar_events set title = 'Moved' where id = $1", [BATH_DAY_1]);
      expect(booking.affectedRows).toBe(0);
    });
  });

  it("the crew tech can't hand the ticket to someone else", async () => {
    await expect(asTech(link(ROSA), (tx) => tx.query("update tickets set assigned_to = $1 where id = $2", [OPS, BATH]))).rejects.toThrow(
      /reassign/,
    );
  });

  it("office roles still see everything", async () => {
    await asTech(
      "",
      async (tx) => {
        expect((await ids(tx, "calendar_events")).length).toBeGreaterThanOrEqual(5);
        expect((await ids(tx, "tickets")).length).toBeGreaterThanOrEqual(5);
      },
      OPS,
    );
  });
});
