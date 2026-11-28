-- =====================================================================
-- Estimates (roadmap chunk S3)
--
--   estimates          one estimate for a ticket. It holds the working
--                      draft: the lines (labor, materials, adders,
--                      multipliers), tax and rounding as JSON, the notes,
--                      and the draft's total. The builder saves the draft
--                      as you type.
--   estimate_versions  saved snapshots of the draft, numbered 1, 2, 3...
--                      per estimate. A version never changes once saved,
--                      so what was sent to a customer can always be shown
--                      again (S4 to S7 build on this).
--
-- Lines are copies of price book items (name, unit and numbers), so a
-- later price book change never changes an estimate already written.
-- Totals are worked out in the app by calculateEstimate (src/core/estimate)
-- and stored here only for lists and the ticket's estimated value.
--
-- Saving a version sets the ticket's estimated value to that version's
-- total, which the ticket timeline then shows as a change.
--
-- Who can do what:
--   admin, sales, operations, reviewer   read estimates and versions
--   admin, sales                         write drafts and save versions
--   admin                                delete an estimate (and its versions)
--   Technicians don't see prices.
-- =====================================================================

create table public.estimates (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets (id) on delete cascade,
  title           text not null default 'Estimate',
  -- {labor: [], materials: [], adders: [], multipliers: [], tax: {...}, rounding: {...}}
  lines           jsonb not null default '{"labor": [], "materials": [], "adders": [], "multipliers": []}'::jsonb,
  -- Shown to the customer (scope of work, what's included and not).
  notes           text not null default '',
  -- Office only.
  internal_notes  text not null default '',
  -- The draft's total as last saved.
  total           numeric(12, 2) not null default 0,
  -- Highest saved version number; 0 until the first version is saved.
  version_count   integer not null default 0,
  is_example      boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint estimates_title_present check (length(btrim(title)) > 0),
  constraint estimates_lines_shape check (jsonb_typeof(lines) = 'object'),
  constraint estimates_total_positive check (total >= 0)
);
comment on table public.estimates is 'Estimates for tickets. The draft lives here; saved versions are in estimate_versions.';
comment on column public.estimates.lines is 'Estimate lines, tax and rounding as JSON, in the shape of EstimateInput in src/core/estimate/math.ts.';

create index estimates_ticket_idx on public.estimates (ticket_id);
create index estimates_updated_idx on public.estimates (updated_at desc);

create trigger estimates_updated_at before update on public.estimates
  for each row execute function public.set_updated_at();

create table public.estimate_versions (
  id              uuid primary key default gen_random_uuid(),
  estimate_id     uuid not null references public.estimates (id) on delete cascade,
  -- Set by the database: 1 for the first saved version, then 2, 3...
  version         integer not null,
  title           text not null,
  lines           jsonb not null,
  notes           text not null default '',
  internal_notes  text not null default '',
  total           numeric(12, 2) not null,
  -- Optional one-liner: "Customer asked for composite boards".
  label           text not null default '',
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint estimate_versions_unique unique (estimate_id, version),
  constraint estimate_versions_total_positive check (total >= 0),
  constraint estimate_versions_lines_shape check (jsonb_typeof(lines) = 'object')
);
comment on table public.estimate_versions is 'Saved snapshots of an estimate. Never changed after saving.';

-- Numbers each new version and records it on the estimate and the ticket.
create or replace function public.estimate_versions_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Lock the estimate so two saves at once can't take the same number.
  select version_count + 1 into new.version from public.estimates where id = new.estimate_id for update;
  if new.version is null then
    raise exception 'That estimate no longer exists.';
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger estimate_versions_number before insert on public.estimate_versions
  for each row execute function public.estimate_versions_number();

create or replace function public.estimate_versions_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
begin
  update public.estimates set version_count = new.version where id = new.estimate_id returning ticket_id into tid;
  update public.tickets set estimated_value = new.total where id = tid and estimated_value is distinct from new.total;
  return new;
end;
$$;
create trigger estimate_versions_record after insert on public.estimate_versions
  for each row execute function public.estimate_versions_record();

-- ---------- Access ----------------------------------------------------

alter table public.estimates enable row level security;
alter table public.estimate_versions enable row level security;

create policy "Office roles read estimates" on public.estimates
  for select to authenticated using (public.has_role('admin', 'sales', 'operations', 'reviewer'));
create policy "Sales and admins add estimates" on public.estimates
  for insert to authenticated with check (public.has_role('admin', 'sales'));
create policy "Sales and admins change estimates" on public.estimates
  for update to authenticated using (public.has_role('admin', 'sales')) with check (public.has_role('admin', 'sales'));
create policy "Admins delete estimates" on public.estimates
  for delete to authenticated using (public.has_role('admin'));

create policy "Office roles read estimate versions" on public.estimate_versions
  for select to authenticated using (public.has_role('admin', 'sales', 'operations', 'reviewer'));
create policy "Sales and admins save estimate versions" on public.estimate_versions
  for insert to authenticated with check (public.has_role('admin', 'sales'));

-- This project doesn't expose new tables to the API automatically.
-- Versions get no update or delete grant: once saved they stay as they were.
grant select, insert, update, delete on public.estimates to authenticated;
grant select, insert on public.estimate_versions to authenticated;
