# Database

Postgres on Supabase (free tier). The schema lives in `migrations/` as plain SQL files, applied in name order.

## Tables (v1, chunk F3)

| Table | What it holds |
| --- | --- |
| `profiles` | People who can sign in, with their role (admin, sales, operations, technician, reviewer). |
| `contacts` | Customers. Phone numbers are also stored as digits only (`phone_digits`) to catch duplicates. |
| `properties` | Job-site addresses. A customer can have several; one can be primary. |
| `tickets` | One job from first call to paid. Has a ticket number starting at 1001. |
| `ticket_stage_transitions` | Which stage moves are allowed, with the button label for each. |
| `ticket_events` | Timeline: created, stage changes, field changes and notes. Filled by triggers. |

Ticket stages run Lead → Site visit → Estimating → Estimate sent → Signed → Scheduling → Scheduled → Onsite → Review → Invoicing → Paid. Any open ticket can be marked Lost (a reason is required), and a lost ticket can be reopened.

## Sign-in and roles (chunk F4)

Accounts live in Supabase Auth. Each new account gets a `profiles` row automatically: the very first account becomes an active **admin**, and every later one starts as a switched-off technician until an admin turns it on and picks a role. Nobody can change their own role, and the last active admin can't be demoted.

Row-level security is on for every table. What each role gets:

| Role | Sees | Can change tickets in these stages |
| --- | --- | --- |
| admin | everything | all; only admins delete |
| sales | all customers and tickets | Lead → Signed, Lost |
| operations | all customers and tickets | Signed → Review, Lost |
| reviewer | all customers and tickets | Onsite (send back), Review → Paid |
| technician | only tickets assigned to them, plus those customers and their history | Scheduled → Review, on their own jobs |

Admins, sales and operations add and edit customers and properties. Anyone who can see a ticket can add a note to it. Switched-off accounts and visitors who aren't signed in see nothing.

## Settings (chunk F5)

- `company_settings`: exactly one row with the company profile (name, license number, contact details, address), the logo as a small inline image (resized to 256px in the browser, at most 300 KB, so no file storage is needed) and `disabled_modules`, the module ids an admin switched off. Settings and the dashboard can't be switched off.
- `option_lists`: dropdown choices admins can edit (`lead_source`, `trade`). Hiding a choice (`active = false`) keeps it on old records. Labels are unique per list, ignoring case and spaces.
- `admin_team_list()`: profiles plus invite status and last sign-in from Supabase Auth, for the Team screen. Returns nothing unless the caller is an admin.

Everyone signed in and switched on can read settings; only admins change them.

### Invites (edge function)

`functions/invite-user` sends a Supabase invite email and sets the new person's role. It uses the secret key that Supabase injects into every edge function only to send the invite (nothing to configure); checking that the caller is an active admin and setting the role run as the caller, so row-level security decides. (This project does not grant tables to `service_role`, so the function must not read tables with the secret key.) Deploy or update it from the Supabase dashboard (Edge Functions → Deploy a new function → via editor, name `invite-user`, paste `functions/invite-user/index.ts`) or with `supabase functions deploy invite-user`. Supabase's built-in email sends only a few messages per hour; a custom SMTP sender (Resend, planned) lifts that.

## Calendar (chunk S8)

`calendar_events` holds everything on the shared calendar: site visits, jobs and other bookings, each with a start and end time. Built for the later chunks:

- `status`: `tentative` (soft, pencilled in; drawn striped) or `confirmed`.
- `crew_id`: the crew doing the work. Crews arrive in chunk O1, which adds the foreign key.
- `color`: optional palette name (`teal`, `blue`, `green`, `amber`, `orange`, `red`, `purple`, `slate`, the `--ev-*` tokens). Empty means the crew's color, then blue for site visits, teal for jobs, slate for other.
- `ticket_id` links a booking to a ticket (kept as empty if the ticket is deleted); `assigned_to` is the person going.

Admins, sales and operations see, add, move and delete bookings. Reviewers see them all. Technicians see only bookings assigned to them or on their tickets.

## Import from the old CRM (chunk F8)

The old Joebros CRM is a single-page Claude artifact. Its customers are not in this database until an admin uploads an export on the Import screen.

- Preferred file: `joebros-crm-export.json` with `format` `joebros-crm-export`, `version` 1, `contacts` (properties nested on each customer) and `tickets` (notes nested on each job). The importer also accepts common names (`customers`, `jobs`, `status`, a single full name, a one-line address).
- A CSV with a header row works too. One row can be one job, with the customer's name, phone, email and address on that same row, or `record_type` can be `contact`, `property`, `ticket` or `note`.
- Rows created by the import are tagged `import_source = 'joebros-crm'` and `import_key` (the id from the file). `import_links` remembers when a file row matched a customer who was already here, by normalized phone or else by email. Loading the same file again adds nothing.
- An imported job may start at whatever stage it is actually in. A job created in this app still has to start at lead, site visit or estimating. Only an admin can set the import tag.
- Dry run previews the counts and the skipped rows and writes nothing.

The artifact's data lives in Claude artifact storage (or that browser, if the page saved it locally). Download it from the artifact's Export or Backup button before unpublishing the artifact. The Import screen has the field list and an example file of fake customers.

## Crews and technicians (chunk O1)

- `crews`: name (unique, ignoring case), `color` from the shared palette (teal, blue, green, amber, orange, red, purple, slate, the same names as the calendar's `--ev-<name>` tokens), `skills` (trade labels), `work_days` (0 = Sunday … 6 = Saturday, default Monday to Friday), `day_start` and `day_end` (default 7:00 to 3:30), `notes`, `active`, `sort`.
- `technicians`: `full_name`, phone, email, optional `crew_id` (they work the crew's hours), optional `profile_id` linking their app login (one login per tech), `skills`, `active`.
- `calendar_events.crew_id` now points at `crews`. A booking with no color of its own is drawn in its crew's color. Deleting a crew leaves its bookings and techs without a crew; normally crews are retired (`active = false`) instead.
- Everyone signed in and switched on can read crews and techs. Admins and operations add and change them; only admins delete.

## Sample data

`seed.sql` adds four example customers, five example tickets, five calendar bookings in the current week, three crews and five techs, all marked `is_example = true`. `npm test` loads it into an in-memory database. The Database action does not load it into the live project. Remove example rows later with:

```sql
delete from public.calendar_events where is_example;
delete from public.technicians where is_example;
delete from public.crews where is_example;
delete from public.tickets where is_example;
delete from public.contacts where is_example;
```

## Backups (chunk F9)

The free Supabase plan keeps no backups of its own, so the **Nightly backup** GitHub Action (`.github/workflows/backup.yml`) makes one every night at 2:17 AM Delaware time (3:17 AM in summer). It can also be started any time from Actions → Nightly backup → Run workflow.

Each run:

1. Dumps the live database with the Supabase CLI into three files, the same ones Supabase's own restore guide uses: `roles.sql`, `schema.sql` (tables, triggers, security policies) and `data.sql` (every row, sign-in accounts included).
2. **Test restore:** starts an empty Supabase database on the GitHub runner, restores the three files into it and checks that every table has exactly as many rows as the backup (`scripts/backup/verify-restore.sh`). If anything doesn't match, the run fails and nothing is saved.
3. Locks the three files in a 7z archive with AES-256 and the `BACKUP_PASSWORD` secret, and keeps it on the run as `joebro-backup-YYYY-MM-DD` for 30 days.

This repository is public. Anyone signed in to GitHub can download a run's files and read its log, so the archive is always encrypted, hidden file names included, and the log prints only totals, never customer data.

### Setting it up

Besides the two database secrets above, add a third repository secret, `BACKUP_PASSWORD`: a long password you pick (four or more random words works well). Keep it in your password manager. **Without it no backup can be opened**, and nobody, Claude included, can recover it. Until it is set, each run still dumps and test-restores, then fails with "no backup was saved".

### Checking it

Open the repo's Actions tab → Nightly backup. Each morning's run should have a green check and, at the bottom of its page under Artifacts, that day's `joebro-backup-…` file. A red X means no backup that night; open the run to see which step failed.

GitHub pauses scheduled actions in a public repository after 60 days with no commits. If that happens, the Actions tab shows a banner with a button to turn it back on.

### Restoring

1. Download the artifact from the run you want (a `.zip`), unzip it, and open the `.7z` inside with [7-Zip](https://www.7-zip.org/) (Windows) or Keka (Mac) using `BACKUP_PASSWORD`. You get `roles.sql`, `schema.sql` and `data.sql`.
2. Restore into an **empty** database: a new Supabase project is safest. The live database already has these tables, so restoring over it fails instead of overwriting anything.
3. In the new project, open Connect and copy the Session pooler connection string. With `psql` installed (it comes with PostgreSQL), run from the folder holding the three files:

   ```sh
   psql --single-transaction -v ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<connection string>"
   ```

   It all goes in as one step: if any line fails, nothing is kept.
4. Point the app at the new project: the Cloudflare Pages variables, `SUPABASE_PROJECT_ID` in both workflows, the auth settings (site URL, redirect URLs, sign-ups off) and the `invite-user` edge function.

To try a restore on your own computer instead, run `supabase db start` in an empty folder that has a `supabase/config.toml`, then `scripts/backup/verify-restore.sh <folder with the three files> postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## How changes reach Supabase

When a change to `supabase/` or `.github/workflows/database.yml` is pushed to `main`, the **Database** GitHub Action links the project and runs `supabase db push --remote` (Supabase CLI 3.4.0). That applies migration files to the linked project and does not load `seed.sql`. It needs two repository secrets (GitHub → repo Settings → Secrets and variables → Actions):

- `SUPABASE_ACCESS_TOKEN`: a personal access token from supabase.com/dashboard/account/tokens
- `SUPABASE_DB_PASSWORD`: the database password set when the project was created (reset it under Project Settings → Database if needed)

Until both are set, the action skips with a warning.

## Testing

`npm test` loads every migration and the seed into an in-memory Postgres (PGlite) and checks the rules: stage moves, required lost reason, phone and email cleanup, one primary property, history logging, RLS on every table, and (in `tests/roles.test.ts`) what each role can see and change. Add a migration as a new file; never edit one that has already been applied.

## Before and after photos (chunk M3)

`ticket_photos` holds one row per photo on a ticket: `tag` (before or after), an optional caption, the picture's size, and where its two files sit in the **private** Storage bucket `ticket-photos`: `<ticket id>/<photo id>.jpg` (shrunk on the phone to at most 1600px) and `<ticket id>/<photo id>-thumb.jpg`. The bucket takes JPEG or WebP up to 2 MB. The app shows files through signed links that expire after an hour; nothing is on a public address.

Anyone who can see the ticket (technicians: their own or their crew's jobs) sees its photos and adds new ones. Whoever took a photo, and admins and operations, can re-tag, caption or remove it. Storage checks the same rules from the file's folder name. Deleting a ticket removes its photo rows; the files stay in Storage until cleared by hand.
