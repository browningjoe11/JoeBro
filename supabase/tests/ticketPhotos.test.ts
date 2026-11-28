// @vitest-environment node
// Checks M3's photo table and the private Storage bucket rules: who sees, adds, changes and removes photos.
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

const ROSA = "00000000-0000-4000-f100-000000000004"; // remodel crew, booked on the bathroom job
const BATH = "00000000-0000-4000-c000-000000000003";
const OTHER = "00000000-0000-4000-c000-000000000001";
const PHOTO = "20000000-0000-4000-8000-000000000001";

// A small stand-in for Supabase Storage, so the bucket and its policies are checked too.
const STORAGE = `
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("tests/supabase-shim.sql"));
  await db.exec(STORAGE);
  for (const file of readdirSync(join(dir, "migrations")).sort()) await db.exec(read(join("migrations", file)));
  await db.exec(read("seed.sql"));
  for (const [who, id] of Object.entries(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${who}@example.com`]);
  }
  for (const role of ["sales", "operations", "technician", "reviewer"] as const) {
    await db.query("update profiles set role = $1, active = true where id = $2", [role, USERS[role]]);
  }
  // The tech is on the remodel crew, which is booked on the bathroom job.
  await db.query("update technicians set profile_id = $1 where id = $2", [USERS.technician, ROSA]);
  await db.query("update tickets set stage = 'scheduled' where id = $1", [BATH]);
  // One photo the operations manager took on the bathroom job.
  await db.query(
    `insert into ticket_photos (id, ticket_id, tag, path, thumb_path, bytes, uploaded_by)
     values ($1, $2, 'before', $3, $4, 250000, $5)`,
    [PHOTO, BATH, `${BATH}/${PHOTO}.jpg`, `${BATH}/${PHOTO}-thumb.jpg`, USERS.operations],
  );
  await db.query("insert into storage.objects (bucket_id, name, owner) values ('ticket-photos', $1, $3), ('ticket-photos', $2, $3)", [
    `${BATH}/${PHOTO}.jpg`,
    `${BATH}/${PHOTO}-thumb.jpg`,
    USERS.operations,
  ]);
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

const photoIds = (tx: Transaction) => tx.query<{ id: string }>("select id from ticket_photos").then((r) => r.rows.map((x) => x.id));
const files = (tx: Transaction) =>
  tx.query<{ name: string }>("select name from storage.objects where bucket_id = 'ticket-photos' order by name").then((r) => r.rows.map((x) => x.name));
const changed = (tx: Transaction, sql: string, params: unknown[] = []) => tx.query(sql, params).then((r) => r.affectedRows ?? 0);
const addPhoto = (tx: Transaction, ticket: string, id = "20000000-0000-4000-8000-0000000000aa") =>
  tx.query("insert into ticket_photos (id, ticket_id, tag, path, thumb_path) values ($1, $2, 'after', $3, $4)", [
    id,
    ticket,
    `${ticket}/${id}.jpg`,
    `${ticket}/${id}-thumb.jpg`,
  ]);
const upload = (tx: Transaction, name: string) => tx.query("insert into storage.objects (bucket_id, name) values ('ticket-photos', $1)", [name]);

describe("ticket photos table", () => {
  it("creates a private bucket that only takes small JPEG or WebP files", async () => {
    const b = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      "select public, file_size_limit::int, allowed_mime_types from storage.buckets where id = 'ticket-photos'",
    );
    expect(b.rows[0]).toEqual({ public: false, file_size_limit: 2097152, allowed_mime_types: ["image/jpeg", "image/webp"] });
  });

  it("only takes before or after, files in the ticket's folder, and photos under about 2 MB", async () => {
    const bad = (tag: string, path: string, bytes: number) =>
      db.query("insert into ticket_photos (ticket_id, tag, path, thumb_path, bytes) values ($1, $2, $3, $4, $5)", [BATH, tag, path, `${BATH}/x-thumb.jpg`, bytes]);
    await expect(bad("during", `${BATH}/x.jpg`, 1000)).rejects.toThrow(/ticket_photos_tag/);
    await expect(bad("after", `${OTHER}/x.jpg`, 1000)).rejects.toThrow(/ticket_photos_path_in_ticket/);
    await expect(bad("after", `${BATH}/x.jpg`, 5_000_000)).rejects.toThrow(/ticket_photos_size/);
  });

  it("keeps a photo on its ticket", async () => {
    await expect(db.query("update ticket_photos set ticket_id = $1 where id = $2", [OTHER, PHOTO])).rejects.toThrow(/stays on its ticket/);
  });

  it("removes photo rows when the ticket is deleted", async () => {
    await db.transaction(async (tx) => {
      await tx.query("delete from tickets where id = $1", [BATH]);
      expect((await tx.query("select 1 from ticket_photos")).rows).toHaveLength(0);
      await tx.rollback();
    });
  });
});

describe("who sees and adds photos", () => {
  it("office roles see the photos; a newcomer sees none", async () => {
    for (const who of ["admin", "sales", "operations", "reviewer"] as const) {
      expect(await as(who, photoIds)).toEqual([PHOTO]);
      expect(await as(who, files)).toHaveLength(2);
    }
    expect(await as("newcomer", photoIds)).toEqual([]);
    expect(await as("newcomer", files)).toEqual([]);
  });

  it("a tech sees and adds photos on their crew's job, and nowhere else", async () => {
    await as("technician", async (tx) => {
      expect(await photoIds(tx)).toEqual([PHOTO]);
      expect(await files(tx)).toHaveLength(2);
      await upload(tx, `${BATH}/new.jpg`);
      await addPhoto(tx, BATH);
      expect(await photoIds(tx)).toHaveLength(2);
    });
    await expect(as("technician", (tx) => addPhoto(tx, OTHER))).rejects.toThrow(/row-level security/);
    await expect(as("technician", (tx) => upload(tx, `${OTHER}/new.jpg`))).rejects.toThrow(/row-level security/);
    await expect(as("technician", (tx) => upload(tx, "not-a-ticket/new.jpg"))).rejects.toThrow(/row-level security/);
  });

  it("nobody can add a photo in someone else's name", async () => {
    await expect(
      as("technician", (tx) =>
        tx.query("insert into ticket_photos (ticket_id, tag, path, thumb_path, uploaded_by) values ($1, 'after', $2, $3, $4)", [
          BATH,
          `${BATH}/y.jpg`,
          `${BATH}/y-thumb.jpg`,
          USERS.operations,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("who changes and removes photos", () => {
  it("the tech can't re-tag or remove a photo someone else took", async () => {
    await as("technician", async (tx) => {
      expect(await changed(tx, "update ticket_photos set tag = 'after' where id = $1", [PHOTO])).toBe(0);
      expect(await changed(tx, "delete from ticket_photos where id = $1", [PHOTO])).toBe(0);
      expect(await changed(tx, "delete from storage.objects where name like $1", [`${BATH}/${PHOTO}%`])).toBe(0);
    });
  });

  it("the tech can change and remove their own photo and its files", async () => {
    await as("technician", async (tx) => {
      const mine = "20000000-0000-4000-8000-0000000000bb";
      await upload(tx, `${BATH}/${mine}.jpg`);
      await upload(tx, `${BATH}/${mine}-thumb.jpg`);
      await addPhoto(tx, BATH, mine);
      expect(await changed(tx, "update ticket_photos set caption = 'Old vanity' where id = $1", [mine])).toBe(1);
      expect(await changed(tx, "delete from storage.objects where name like $1", [`${BATH}/${mine}%`])).toBe(2);
      expect(await changed(tx, "delete from ticket_photos where id = $1", [mine])).toBe(1);
    });
  });

  it("a tech can clear files from an upload that never got a photo row", async () => {
    await as("technician", async (tx) => {
      await upload(tx, `${BATH}/orphan.jpg`);
      expect(await changed(tx, "delete from storage.objects where name = $1", [`${BATH}/orphan.jpg`])).toBe(1);
    });
  });

  it("admins and operations can re-tag and remove any photo; sales and reviewers can't", async () => {
    for (const who of ["admin", "operations"] as const) {
      await as(who, async (tx) => {
        expect(await changed(tx, "update ticket_photos set tag = 'after' where id = $1", [PHOTO])).toBe(1);
        expect(await changed(tx, "delete from storage.objects where name like $1", [`${BATH}/${PHOTO}%`])).toBe(2);
        expect(await changed(tx, "delete from ticket_photos where id = $1", [PHOTO])).toBe(1);
      });
    }
    for (const who of ["sales", "reviewer"] as const) {
      await as(who, async (tx) => {
        expect(await changed(tx, "update ticket_photos set tag = 'after' where id = $1", [PHOTO])).toBe(0);
        expect(await changed(tx, "delete from ticket_photos where id = $1", [PHOTO])).toBe(0);
      });
    }
  });
});
