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

`functions/invite-user` sends a Supabase invite email and sets the new person's role. It checks that the caller is an active admin, then uses the service role key that Supabase injects into every edge function (nothing to configure). Deploy or update it from the Supabase dashboard (Edge Functions → Deploy a new function → via editor, name `invite-user`, paste `functions/invite-user/index.ts`) or with `supabase functions deploy invite-user`. Supabase's built-in email sends only a few messages per hour; a custom SMTP sender (Resend, planned) lifts that.

## Sample data

`seed.sql` adds four example customers and five example tickets, all marked `is_example = true`. Remove them later with:

```sql
delete from public.tickets where is_example;
delete from public.contacts where is_example;
```

## How changes reach Supabase

When a change to `supabase/` is merged into `main`, the **Database** GitHub Action runs `supabase db push --include-seed`. It needs two repository secrets (GitHub → repo Settings → Secrets and variables → Actions):

- `SUPABASE_ACCESS_TOKEN`: a personal access token from supabase.com/dashboard/account/tokens
- `SUPABASE_DB_PASSWORD`: the database password set when the project was created (reset it under Project Settings → Database if needed)

Until both are set, the action skips with a warning.

## Testing

`npm test` loads every migration and the seed into an in-memory Postgres (PGlite) and checks the rules: stage moves, required lost reason, phone and email cleanup, one primary property, history logging, RLS on every table, and (in `tests/roles.test.ts`) what each role can see and change. Add a migration as a new file; never edit one that has already been applied.
