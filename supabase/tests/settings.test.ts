// @vitest-environment node
// Checks the F5 settings tables: everyone switched on can read them, only admins change them.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

const ADMIN = "20000000-0000-4000-8000-000000000001";
const SALES = "20000000-0000-4000-8000-000000000002";
const PENDING = "20000000-0000-4000-8000-000000000003";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'boss@example.com', now())", [ADMIN]);
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'sam@example.com', now())", [SALES]);
  await db.query("insert into auth.users (id, email, invited_at) values ($1, 'new@example.com', now())", [PENDING]);
  await db.query("update profiles set role = 'sales', active = true where id = $1", [SALES]);
}, 30_000);

afterAll(async () => {
  await db.close();
});

async function as<R>(id: string, fn: (tx: Transaction) => Promise<R>): Promise<R> {
  let result!: R;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
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

const rows = <T>(tx: Transaction, sql: string, params: unknown[] = []) => tx.query<T>(sql, params).then((r) => r.rows);
const changed = (tx: Transaction, sql: string, params: unknown[] = []) => tx.query(sql, params).then((r) => r.affectedRows ?? 0);

describe("company settings", () => {
  it("starts with one row named for the company and default dropdown lists", async () => {
    const { rows: company } = await db.query<{ name: string }>("select name from company_settings");
    expect(company).toEqual([{ name: "Joebros Contracting Services" }]);
    const { rows: lists } = await db.query<{ list: string; n: number }>("select list, count(*)::int n from option_lists group by list order by list");
    expect(lists.map((l) => l.list)).toEqual(["lead_source", "trade"]);
    expect(lists.every((l) => l.n >= 5)).toBe(true);
  });

  it("lets every switched-on user read settings, but not accounts waiting for approval", async () => {
    expect(await as(SALES, (tx) => rows(tx, "select name from company_settings"))).toHaveLength(1);
    expect((await as(SALES, (tx) => rows(tx, "select 1 from option_lists"))).length).toBeGreaterThan(0);
    expect(await as(PENDING, (tx) => rows(tx, "select name from company_settings"))).toHaveLength(0);
  });

  it("only lets admins change settings and lists", async () => {
    expect(await as(SALES, (tx) => changed(tx, "update company_settings set name = 'Nope'"))).toBe(0);
    expect(await as(ADMIN, (tx) => changed(tx, "update company_settings set name = 'Joebros LLC', disabled_modules = '{onsite}'"))).toBe(1);
    await expect(as(SALES, (tx) => tx.query("insert into option_lists (list, label) values ('trade', 'Gutters')"))).rejects.toThrow(
      /row-level security/,
    );
    await expect(as(ADMIN, (tx) => tx.query("insert into option_lists (list, label) values ('trade', 'Gutters')"))).resolves.toBeTruthy();
  });

  it("never lets Settings or the dashboard be switched off", async () => {
    await expect(as(ADMIN, (tx) => tx.query("update company_settings set disabled_modules = '{settings}'"))).rejects.toThrow(
      /company_settings_core_modules/,
    );
  });

  it("rejects duplicate list choices and oversized logos", async () => {
    await expect(db.query("insert into option_lists (list, label) values ('trade', ' siding ')")).rejects.toThrow(/option_lists_unique_label/);
    await expect(db.query("update company_settings set logo_data_url = 'https://example.com/logo.png'")).rejects.toThrow(
      /company_settings_logo_size/,
    );
  });
});

describe("team list", () => {
  type Member = { email: string; role: string; active: boolean; invited_at: string | null; confirmed_at: string | null };

  it("shows admins everyone with their invite status", async () => {
    const team = await as(ADMIN, (tx) => rows<Member>(tx, "select email, role, active, invited_at, confirmed_at from admin_team_list()"));
    expect(team.map((m) => m.email).sort()).toEqual(["boss@example.com", "new@example.com", "sam@example.com"]);
    const pending = team.find((m) => m.email === "new@example.com")!;
    expect(pending.invited_at).not.toBeNull();
    expect(pending.confirmed_at).toBeNull();
  });

  it("shows other roles nobody", async () => {
    expect(await as(SALES, (tx) => rows(tx, "select * from admin_team_list()"))).toEqual([]);
  });
});
