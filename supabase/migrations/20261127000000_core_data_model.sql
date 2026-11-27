-- =====================================================================
-- Joebros data model v1 (roadmap chunk F3)
-- Contacts, properties, tickets, ticket history, users and roles.
-- Applied automatically to Supabase on merge to main (see supabase/README.md).
-- =====================================================================

-- ---------- Enumerations ----------------------------------------------

create type public.app_role as enum ('admin', 'sales', 'operations', 'technician', 'reviewer');

-- The path a job takes. Order matters: it is the left-to-right order of the pipeline.
create type public.ticket_stage as enum (
  'lead',           -- new request, not yet qualified
  'site_visit',     -- visit booked before estimating
  'estimating',     -- estimate being built
  'estimate_sent',  -- waiting on the customer's signature
  'signed',         -- customer signed; hand-off to Operations
  'scheduling',     -- being placed on the calendar (soft schedule)
  'scheduled',      -- confirmed with the customer
  'onsite',         -- crew working the job
  'review',         -- completed, back office checking report vs scope
  'invoicing',      -- approved, being billed
  'paid',           -- balance zero; closed
  'lost'            -- did not go ahead (reason required)
);

create type public.contact_method as enum ('phone', 'text', 'email');

-- ---------- Shared helpers -------------------------------------------

-- Keeps updated_at current on every UPDATE.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Digits only, so "(302) 555-0142" and "302.555.0142" match. Drops a leading US "1".
create or replace function public.normalize_phone(raw text) returns text
language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(coalesce(raw, ''), '\D', '', 'g'), '^1(\d{10})$', '\1'), '');
$$;

-- ---------- Users and roles -------------------------------------------

-- One row per person who can sign in. id matches Supabase Auth's user id.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  role        public.app_role not null default 'technician',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'App users. Role decides which modules and records they can use (enforced in F4).';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Contacts (customers) -------------------------------------

create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  first_name        text not null default '',
  last_name         text not null default '',
  company           text,
  email             text,
  phone             text,
  phone_digits      text generated always as (public.normalize_phone(phone)) stored,
  phone_alt         text,
  preferred_contact public.contact_method not null default 'phone',
  lead_source       text,
  notes             text,
  is_example        boolean not null default false,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint contacts_has_name check (length(trim(first_name || last_name || coalesce(company, ''))) > 0),
  constraint contacts_email_lowercase check (email is null or email = lower(trim(email))),
  constraint contacts_email_shape check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
comment on table public.contacts is 'Customers. Tickets point here, so editing a phone or email anywhere updates it everywhere (C2).';
comment on column public.contacts.is_example is 'Sample data. Safe to delete; hidden once real data exists.';

create index contacts_email_idx on public.contacts (email);
create index contacts_phone_digits_idx on public.contacts (phone_digits);
create index contacts_name_idx on public.contacts (lower(last_name), lower(first_name));

create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- Store emails lowercased and trimmed so duplicates are easy to catch.
create or replace function public.contacts_clean() returns trigger
language plpgsql as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.first_name := trim(new.first_name);
  new.last_name := trim(new.last_name);
  return new;
end;
$$;
create trigger contacts_clean before insert or update on public.contacts
  for each row execute function public.contacts_clean();

-- ---------- Properties (job sites) ------------------------------------

create table public.properties (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  label       text,                         -- e.g. "Home", "Rental on Bay Rd"
  street      text not null,
  unit        text,
  city        text not null,
  state       text not null default 'DE',
  zip         text,
  county      text,
  latitude    double precision,
  longitude   double precision,
  access_notes text,                        -- gate codes, dogs, parking
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint properties_state_code check (state ~ '^[A-Z]{2}$'),
  constraint properties_zip_shape check (zip is null or zip ~ '^\d{5}(-\d{4})?$'),
  constraint properties_county check (county is null or county in ('Kent', 'Sussex', 'New Castle', 'Other')),
  constraint properties_lat check (latitude is null or latitude between -90 and 90),
  constraint properties_lng check (longitude is null or longitude between -180 and 180)
);
comment on table public.properties is 'Job site addresses. A customer can have several.';

create index properties_contact_idx on public.properties (contact_id);
-- At most one primary property per customer.
create unique index properties_one_primary on public.properties (contact_id) where is_primary;

create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------- Tickets (jobs) --------------------------------------------

create table public.tickets (
  id               uuid primary key default gen_random_uuid(),
  number           bigint generated always as identity (start with 1001) unique,  -- human-friendly ticket #
  contact_id       uuid not null references public.contacts (id) on delete restrict,
  property_id      uuid references public.properties (id) on delete set null,
  title            text not null,
  trade            text,
  scope            text,                     -- scope of work, plain words
  stage            public.ticket_stage not null default 'lead',
  stage_changed_at timestamptz not null default now(),
  lost_reason      text,
  lead_source      text,
  assigned_to      uuid references public.profiles (id) on delete set null,
  estimated_value  numeric(12, 2),
  next_action_at   timestamptz,              -- next follow-up or due date; drives the dashboard (F7)
  is_example       boolean not null default false,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tickets_title_present check (length(trim(title)) > 0),
  constraint tickets_value_positive check (estimated_value is null or estimated_value >= 0),
  constraint tickets_lost_needs_reason check (stage <> 'lost' or length(trim(coalesce(lost_reason, ''))) > 0)
);
comment on table public.tickets is 'One job from first call to paid. Stage moves follow public.ticket_stage_transitions.';

create index tickets_stage_idx on public.tickets (stage);
create index tickets_contact_idx on public.tickets (contact_id);
create index tickets_property_idx on public.tickets (property_id);
create index tickets_assigned_idx on public.tickets (assigned_to);
create index tickets_next_action_idx on public.tickets (next_action_at) where stage not in ('paid', 'lost');

create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

-- The property must belong to the ticket's customer.
create or replace function public.tickets_check_property() returns trigger
language plpgsql as $$
begin
  if new.property_id is not null and not exists (
    select 1 from public.properties p where p.id = new.property_id and p.contact_id = new.contact_id
  ) then
    raise exception 'Property % does not belong to contact %', new.property_id, new.contact_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger tickets_check_property before insert or update of property_id, contact_id on public.tickets
  for each row execute function public.tickets_check_property();

-- ---------- Stage rules -----------------------------------------------

-- Allowed moves between stages. The app reads this to show only valid next steps.
create table public.ticket_stage_transitions (
  from_stage public.ticket_stage not null,
  to_stage   public.ticket_stage not null,
  label      text not null,                  -- button text, e.g. "Send estimate"
  primary key (from_stage, to_stage),
  constraint transitions_not_self check (from_stage <> to_stage)
);
comment on table public.ticket_stage_transitions is 'Valid stage moves. Lost is reachable from any open stage; reopening a lost ticket returns it to Lead.';

insert into public.ticket_stage_transitions (from_stage, to_stage, label) values
  ('lead',          'site_visit',    'Book site visit'),
  ('lead',          'estimating',    'Start estimate'),
  ('site_visit',    'estimating',    'Start estimate'),
  ('estimating',    'estimate_sent', 'Send estimate'),
  ('estimate_sent', 'estimating',    'Revise estimate'),
  ('estimate_sent', 'signed',        'Mark signed'),
  ('signed',        'scheduling',    'Start scheduling'),
  ('scheduling',    'scheduled',     'Confirm schedule'),
  ('scheduled',     'scheduling',    'Reschedule'),
  ('scheduled',     'onsite',        'Start job'),
  ('onsite',        'review',        'Mark job complete'),
  ('review',        'onsite',        'Send back to tech'),
  ('review',        'invoicing',     'Approve for invoicing'),
  ('invoicing',     'paid',          'Mark paid'),
  ('lost',          'lead',          'Reopen');

insert into public.ticket_stage_transitions (from_stage, to_stage, label)
select s, 'lost', 'Mark lost'
from unnest(enum_range(null::public.ticket_stage)) as s
where s not in ('paid', 'lost');

-- Reject stage moves that aren't in the table; stamp stage_changed_at; clear lost_reason on reopen.
create or replace function public.tickets_enforce_stage() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.stage not in ('lead', 'site_visit', 'estimating') and not new.is_example then
      raise exception 'New tickets start at lead, site_visit or estimating, not %', new.stage
        using errcode = 'check_violation';
    end if;
    new.stage_changed_at := now();
    return new;
  end if;

  if new.stage is distinct from old.stage then
    if not exists (
      select 1 from public.ticket_stage_transitions t
      where t.from_stage = old.stage and t.to_stage = new.stage
    ) then
      raise exception 'A ticket cannot move from % to %', old.stage, new.stage
        using errcode = 'check_violation';
    end if;
    new.stage_changed_at := now();
    if old.stage = 'lost' then
      new.lost_reason := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger tickets_enforce_stage before insert or update of stage on public.tickets
  for each row execute function public.tickets_enforce_stage();

-- ---------- Ticket history --------------------------------------------

create table public.ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  kind        text not null,
  from_stage  public.ticket_stage,
  to_stage    public.ticket_stage,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint ticket_events_kind check (kind in ('created', 'stage_changed', 'updated', 'note'))
);
comment on table public.ticket_events is 'Timeline of everything that happened to a ticket. Written by triggers, plus notes from the app.';

create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at desc);

-- Fields whose changes are worth showing on the timeline.
create or replace function public.tickets_log_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  changes jsonb := '{}'::jsonb;
  col text;
begin
  -- Only reference a profile that exists (service jobs and imports have none).
  if actor is not null and not exists (select 1 from public.profiles where id = actor) then
    actor := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.ticket_events (ticket_id, actor_id, kind, to_stage, data)
    values (new.id, actor, 'created', new.stage, jsonb_build_object('title', new.title));
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into public.ticket_events (ticket_id, actor_id, kind, from_stage, to_stage, data)
    values (new.id, actor, 'stage_changed', old.stage, new.stage,
            case when new.stage = 'lost' then jsonb_build_object('lost_reason', new.lost_reason) else '{}'::jsonb end);
  end if;

  foreach col in array array['title', 'scope', 'trade', 'assigned_to', 'estimated_value', 'property_id', 'next_action_at'] loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      changes := changes || jsonb_build_object(col, jsonb_build_object('from', to_jsonb(old) -> col, 'to', to_jsonb(new) -> col));
    end if;
  end loop;
  if changes <> '{}'::jsonb then
    insert into public.ticket_events (ticket_id, actor_id, kind, data) values (new.id, actor, 'updated', changes);
  end if;
  return new;
end;
$$;
create trigger tickets_log_event after insert or update on public.tickets
  for each row execute function public.tickets_log_event();

-- ---------- Row-level security ----------------------------------------
-- Everything is locked to signed-in, active users for now. Chunk F4 replaces
-- these with per-role rules. Anonymous (not signed in) visitors get nothing.

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.properties enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_stage_transitions enable row level security;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_active_user());

create policy "Active users read and write contacts" on public.contacts
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "Active users read and write properties" on public.properties
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "Active users read and write tickets" on public.tickets
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "Active users read ticket history" on public.ticket_events
  for select to authenticated using (public.is_active_user());
create policy "Active users add notes" on public.ticket_events
  for insert to authenticated with check (public.is_active_user() and kind = 'note');
create policy "Signed-in users read stage rules" on public.ticket_stage_transitions
  for select to authenticated using (true);
