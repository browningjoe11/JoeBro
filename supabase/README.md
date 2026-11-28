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

## How changes reach Supabase

When a change to `supabase/` or `.github/workflows/database.yml` is pushed to `main`, the **Database** GitHub Action links the project and runs `supabase db push --remote` (Supabase CLI 3.4.0). That applies migration files to the linked project and does not load `seed.sql`. It needs two repository secrets (GitHub → repo Settings → Secrets and variables → Actions):

- `SUPABASE_ACCESS_TOKEN`: a personal access token from supabase.com/dashboard/account/tokens
- `SUPABASE_DB_PASSWORD`: the database password set when the project was created (reset it under Project Settings → Database if needed)

Until both are set, the action skips with a warning.

## Testing

`npm test` loads every migration and the seed into an in-memory Postgres (PGlite) and checks the rules: stage moves, required lost reason, phone and email cleanup, one primary property, history logging, RLS on every table, and (in `tests/roles.test.ts`) what each role can see and change. Add a migration as a new file; never edit one that has already been applied.
