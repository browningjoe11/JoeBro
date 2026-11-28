// @vitest-environment node
// Checks the O3 rule that a job site's saved map position is cleared when its address changes.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..");
const read = (p: string) => readFileSync(join(dir, p), "utf8");
const SITE = "00000000-0000-4000-b000-000000000001";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.exec(read("seed.sql"));
}, 30_000);

afterAll(async () => {
  await db.close();
});

async function site() {
  const { rows } = await db.query<{ latitude: number | null; longitude: number | null }>("select latitude, longitude from properties where id = $1", [SITE]);
  return rows[0];
}

describe("job site map position", () => {
  it("keeps a position the app saves, and clears it when the address changes", async () => {
    await db.query("update properties set latitude = 39.17, longitude = -75.55 where id = $1", [SITE]);
    expect(await site()).toEqual({ latitude: 39.17, longitude: -75.55 });

    await db.query("update properties set access_notes = 'Gate code 1234' where id = $1", [SITE]);
    expect(await site()).toEqual({ latitude: 39.17, longitude: -75.55 });

    await db.query("update properties set street = '120 Fox Hall Dr' where id = $1", [SITE]);
    expect(await site()).toEqual({ latitude: null, longitude: null });
  });

  it("keeps a new position sent along with a new address", async () => {
    await db.query("update properties set zip = '19901', latitude = 39.15, longitude = -75.52 where id = $1", [SITE]);
    expect(await site()).toEqual({ latitude: 39.15, longitude: -75.52 });
  });

  it("doesn't log a position change in the customer's change history", async () => {
    const before = await db.query<{ n: number }>("select count(*)::int as n from contact_changes where property_id = $1", [SITE]);
    await db.query("update properties set latitude = 39.16, longitude = -75.53 where id = $1", [SITE]);
    const after = await db.query<{ n: number }>("select count(*)::int as n from contact_changes where property_id = $1", [SITE]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
