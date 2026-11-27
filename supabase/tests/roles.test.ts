// @vitest-environment node
// Checks the F4 per-role rules: each role sees and changes only what it should.
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

const T = {
  deck: "00000000-0000-4000-c000-000000000001", // estimate_sent
  siding: "00000000-0000-4000-c000-000000000002", // site_visit
  bath: "00000000-0000-4000-c000-000000000003", // scheduling, Elaine Porter
  fence: "00000000-0000-4000-c000-000000000004", // lead
};
const ELAINE = "00000000-0000-4000-a000-000000000003";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.exec(read("seed.sql"));
  // Sign up one person per role, in order, so the first becomes admin.
  for (const [who, id] of Object.entries(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${who}@example.com`]);
  }
  for (const role of ["sales", "operations", "technician", "reviewer"] as const) {
    await db.query("update profiles set role = $1, active = true where id = $2", [role, USERS[role]]);
  }
  // The bathroom job is scheduled and given to the technician.
  await db.query("update tickets set stage = 'scheduled', assigned_to = $1 where id = $2", [USERS.technician, T.bath]);
}, 30_000);

afterAll(async () => {
  await db.close();
});

/** Runs fn as a signed-in user (or anonymous), then rolls back so tests don't affect each other. */
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

const count = (tx: Transaction, table: string) =>
  tx.query<{ n: number }>(`select count(*)::int n from ${table}`).then((r) => r.rows[0].n);

const changed = (tx: Transaction, sql: string, params: unknown[] = []) =>
  tx.query(sql, params).then((r) => r.affectedRows ?? 0);

describe("sign-up", () => {
  it("makes the first person an active admin and starts later sign-ups switched off", async () => {
    const { rows } = await db.query<{ id: string; role: string; active: boolean; email: string }>(
      "select id, role, active, email from profiles where id in ($1, $2) order by email",
      [USERS.admin, USERS.newcomer],
    );
    expect(rows).toEqual([
      { id: USERS.admin, role: "admin", active: true, email: "admin@example.com" },
      { id: USERS.newcomer, role: "technician", active: false, email: "newcomer@example.com" },
    ]);
  });
});

describe("what each role can see", () => {
  it("gives office roles every customer and ticket", async () => {
    for (const who of ["admin", "sales", "operations", "reviewer"] as const) {
      const seen = await as(who, async (tx) => ({ tickets: await count(tx, "tickets"), contacts: await count(tx, "contacts") }));
      expect(seen, who).toEqual({ tickets: 5, contacts: 4 });
    }
  });

  it("shows a technician only their assigned jobs, those customers, and those jobs' history", async () => {
    const seen = await as("technician", async (tx) => ({
      tickets: (await tx.query<{ id: string }>("select id from tickets")).rows.map((r) => r.id),
      contacts: (await tx.query<{ id: string }>("select id from contacts")).rows.map((r) => r.id),
      otherHistory: (await tx.query("select 1 from ticket_events where ticket_id <> $1", [T.bath])).rows.length,
    }));
    expect(seen).toEqual({ tickets: [T.bath], contacts: [ELAINE], otherHistory: 0 });
  });

  it("shows switched-off accounts and visitors nothing but their own profile", async () => {
    const newcomer = await as("newcomer", async (tx) => ({
      tickets: await count(tx, "tickets"),
      contacts: await count(tx, "contacts"),
      profiles: await count(tx, "profiles"),
    }));
    expect(newcomer).toEqual({ tickets: 0, contacts: 0, profiles: 1 });
    const anon = await as("anon", async (tx) => ({ tickets: await count(tx, "tickets"), profiles: await count(tx, "profiles") }));
    expect(anon).toEqual({ tickets: 0, profiles: 0 });
  });
});

describe("who can move tickets", () => {
  it("lets sales work early stages but not jobs already in operations", async () => {
    await as("sales", async (tx) => {
      expect(await changed(tx, "update tickets set stage = 'site_visit' where id = $1", [T.fence])).toBe(1);
      expect(await changed(tx, "update tickets set title = 'x' where id = $1", [T.bath])).toBe(0);
    });
  });

  it("lets sales mark a job signed but not schedule it", async () => {
    await expect(
      as("sales", async (tx) => {
        await tx.query("update tickets set stage = 'signed' where id = $1", [T.deck]);
        await tx.query("update tickets set stage = 'scheduling' where id = $1", [T.deck]);
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets operations schedule work but not touch fresh leads", async () => {
    await as("operations", async (tx) => {
      expect(await changed(tx, "update tickets set stage = 'onsite' where id = $1", [T.bath])).toBe(1);
      expect(await changed(tx, "update tickets set title = 'x' where id = $1", [T.fence])).toBe(0);
    });
  });

  it("lets a technician start their job but not hand it to someone else", async () => {
    await as("technician", async (tx) => {
      expect(await changed(tx, "update tickets set stage = 'onsite' where id = $1", [T.bath])).toBe(1);
    });
    await expect(
      as("technician", (tx) => tx.query("update tickets set assigned_to = null where id = $1", [T.bath])),
    ).rejects.toThrow(/row-level security/);
  });

  it("only lets admins delete tickets", async () => {
    expect(await as("sales", (tx) => changed(tx, "delete from tickets where id = $1", [T.fence]))).toBe(0);
    expect(await as("admin", (tx) => changed(tx, "delete from tickets where id = $1", [T.fence]))).toBe(1);
  });
});

describe("customers and notes", () => {
  const addContact = (tx: Transaction) => tx.query("insert into contacts (first_name) values ('Pat')");

  it("lets sales add customers but not reviewers or technicians", async () => {
    await expect(as("sales", addContact)).resolves.toBeTruthy();
    await expect(as("reviewer", addContact)).rejects.toThrow(/row-level security/);
    await expect(as("technician", addContact)).rejects.toThrow(/row-level security/);
  });

  it("lets a technician add notes to their own job only", async () => {
    const note = (ticket: string) => (tx: Transaction) =>
      tx.query("insert into ticket_events (ticket_id, actor_id, kind, data) values ($1, $2, 'note', '{\"text\":\"hi\"}')", [
        ticket,
        USERS.technician,
      ]);
    await expect(as("technician", note(T.bath))).resolves.toBeTruthy();
    await expect(as("technician", note(T.deck))).rejects.toThrow(/row-level security/);
  });
});

describe("roles and accounts", () => {
  it("stops people from promoting themselves", async () => {
    await expect(
      as("technician", (tx) => tx.query("update profiles set role = 'admin' where id = $1", [USERS.technician])),
    ).rejects.toThrow(/Only an admin/);
  });

  it("lets people edit their own name, and admins switch others on", async () => {
    expect(await as("sales", (tx) => changed(tx, "update profiles set full_name = 'Sam Sales' where id = $1", [USERS.sales]))).toBe(1);
    expect(await as("sales", (tx) => changed(tx, "update profiles set full_name = 'x' where id = $1", [USERS.reviewer]))).toBe(0);
    expect(
      await as("admin", (tx) => changed(tx, "update profiles set active = true, role = 'sales' where id = $1", [USERS.newcomer])),
    ).toBe(1);
  });

  it("keeps at least one active admin", async () => {
    await expect(
      as("admin", (tx) => tx.query("update profiles set role = 'sales' where id = $1", [USERS.admin])),
    ).rejects.toThrow(/at least one active admin/);
  });
});
