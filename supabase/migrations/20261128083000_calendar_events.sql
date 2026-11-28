-- =====================================================================
-- Shared calendar (roadmap chunk S8)
--
-- One table for everything that takes up time on the calendar: site visits
-- (S9), jobs (O2 scheduling board) and anything else. Built so later chunks
-- don't need to reshape it:
--   * status:   tentative ("soft", pencilled in) or confirmed.
--   * crew_id:  the crew doing the work. Crews arrive in chunk O1, which adds
--               the foreign key; until then it stays empty.
--   * color:    optional override from the shared palette. When empty the app
--               uses the crew's color, then a default per kind.
--   * ticket_id links the event to a job's ticket.
--
-- Who can do what:
--   admin, sales, operations   see every event, add, move, resize and delete
--   reviewer                   sees every event
--   technician                 sees events assigned to them or on their tickets
-- =====================================================================

create type public.calendar_event_kind as enum ('site_visit', 'job', 'other');
create type public.calendar_event_status as enum ('tentative', 'confirmed');

create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  kind        public.calendar_event_kind not null default 'other',
  status      public.calendar_event_status not null default 'confirmed',
  title       text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  ticket_id   uuid references public.tickets (id) on delete set null,
  crew_id     uuid,
  assigned_to uuid references public.profiles (id) on delete set null,
  color       text,
  notes       text,
  is_example  boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendar_events_title_present check (length(trim(title)) > 0),
  constraint calendar_events_ends_after_start check (ends_at > starts_at),
  -- Same names as the palette tokens (--ev-<name>) in src/styles/tokens.css.
  constraint calendar_events_color_known check (
    color is null or color in ('teal', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'slate')
  )
);

comment on table public.calendar_events is 'Shared calendar: site visits, jobs and other bookings. Soft (tentative) or confirmed, optionally per crew.';
comment on column public.calendar_events.crew_id is 'Crew doing the work. Foreign key added with the crews table in chunk O1.';
comment on column public.calendar_events.color is 'Palette name overriding the crew or kind color. Null means automatic.';

create index calendar_events_starts_at_idx on public.calendar_events (starts_at);
create index calendar_events_ticket_idx on public.calendar_events (ticket_id);
create index calendar_events_crew_idx on public.calendar_events (crew_id);
create index calendar_events_assigned_idx on public.calendar_events (assigned_to);

create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- ---------- Access ----------------------------------------------------

-- True when the signed-in technician is on this event: assigned to it, or it
-- belongs to one of their tickets.
create or replace function public.tech_on_event(e public.calendar_events) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(e.assigned_to = auth.uid(), false)
      or exists (select 1 from public.tickets t where t.id = e.ticket_id and t.assigned_to = auth.uid());
$$;

alter table public.calendar_events enable row level security;

create policy "Office roles read the calendar" on public.calendar_events
  for select to authenticated using (public.has_role('admin', 'sales', 'operations', 'reviewer'));
create policy "Technicians read their own events" on public.calendar_events
  for select to authenticated using (public.has_role('technician') and public.tech_on_event(calendar_events));
create policy "Schedulers add events" on public.calendar_events
  for insert to authenticated with check (public.has_role('admin', 'sales', 'operations'));
create policy "Schedulers change events" on public.calendar_events
  for update to authenticated using (public.has_role('admin', 'sales', 'operations'))
  with check (public.has_role('admin', 'sales', 'operations'));
create policy "Schedulers delete events" on public.calendar_events
  for delete to authenticated using (public.has_role('admin', 'sales', 'operations'));

-- This project doesn't expose new tables to the API automatically.
grant select, insert, update, delete on public.calendar_events to authenticated;
grant execute on function public.tech_on_event(public.calendar_events) to authenticated;
