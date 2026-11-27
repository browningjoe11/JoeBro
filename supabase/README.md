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

Row-level security is on for every table: only signed-in, active users can read or write. Chunk F4 narrows this by role.

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

`npm test` loads every migration and the seed into an in-memory Postgres (PGlite) and checks the rules: stage moves, required lost reason, phone and email cleanup, one primary property, history logging, and RLS on every table. Add a migration as a new file; never edit one that has already been applied.
