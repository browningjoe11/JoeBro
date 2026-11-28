-- =====================================================================
-- Crews and technicians (roadmap chunk O1)
--
--   crews        a team that goes out to jobs together. Each has one color
--                from the shared palette (the same names as the calendar's
--                --ev-<name> tokens), the trades it can do, and its working
--                days and hours. Techs on the crew work the crew's hours.
--   technicians  the people in the field. A tech may belong to one crew, may
--                be linked to an app login (profiles) once they sign in, and
--                has their own skills.
--
-- Crews and techs are retired (active = false), not deleted, so old bookings
-- keep their color. Deleting a crew anyway leaves its bookings with no crew.
--
-- Who can do what:
--   everyone signed in and switched on   sees crews and techs (the calendar,
--                                        the scheduling board and onsite need
--                                        the colors and names)
--   admin, operations                    add and change them
-- =====================================================================

create table public.crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Same names as the palette tokens (--ev-<name>) in src/styles/tokens.css.
  color       text not null default 'teal',
  -- Trade labels from option_lists (list = 'trade').
  skills      text[] not null default '{}',
  -- Days of the week the crew works, 0 = Sunday ... 6 = Saturday.
  work_days   smallint[] not null default '{1,2,3,4,5}',
  day_start   time not null default '07:00',
  day_end     time not null default '15:30',
  notes       text,
  active      boolean not null default true,
  sort        integer not null default 0,
  is_example  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crews_name_present check (length(btrim(name)) > 0),
  constraint crews_color_known check (color in ('teal', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'slate')),
  constraint crews_hours_order check (day_end > day_start),
  constraint crews_work_days_valid check (cardinality(work_days) > 0 and work_days <@ '{0,1,2,3,4,5,6}'::smallint[])
);
comment on table public.crews is 'Crews that go out to jobs, each with a palette color, skills (trades) and working hours.';
comment on column public.crews.color is 'Palette name. Bookings for the crew are drawn in this color unless they set their own.';

create unique index crews_unique_name on public.crews (lower(btrim(name)));

create trigger crews_updated_at before update on public.crews
  for each row execute function public.set_updated_at();

create table public.technicians (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  email       text,
  crew_id     uuid references public.crews (id) on delete set null,
  -- The tech's app login, once they have one. One login is one tech.
  profile_id  uuid unique references public.profiles (id) on delete set null,
  skills      text[] not null default '{}',
  notes       text,
  active      boolean not null default true,
  is_example  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint technicians_name_present check (length(btrim(full_name)) > 0)
);
comment on table public.technicians is 'People in the field. Optionally on a crew (and its color and hours) and linked to an app login.';

create index technicians_crew_idx on public.technicians (crew_id);

create trigger technicians_updated_at before update on public.technicians
  for each row execute function public.set_updated_at();

-- The calendar (S8) left crew_id waiting for this table.
alter table public.calendar_events
  add constraint calendar_events_crew_id_fkey foreign key (crew_id) references public.crews (id) on delete set null;
comment on column public.calendar_events.crew_id is 'Crew doing the work. The booking takes the crew''s color unless color is set.';

-- ---------- Access ----------------------------------------------------

alter table public.crews enable row level security;
alter table public.technicians enable row level security;

create policy "Active users read crews" on public.crews
  for select to authenticated using (public.current_app_role() is not null);
create policy "Admins and operations add crews" on public.crews
  for insert to authenticated with check (public.has_role('admin', 'operations'));
create policy "Admins and operations change crews" on public.crews
  for update to authenticated using (public.has_role('admin', 'operations')) with check (public.has_role('admin', 'operations'));
create policy "Admins delete crews" on public.crews
  for delete to authenticated using (public.has_role('admin'));

create policy "Active users read technicians" on public.technicians
  for select to authenticated using (public.current_app_role() is not null);
create policy "Admins and operations add technicians" on public.technicians
  for insert to authenticated with check (public.has_role('admin', 'operations'));
create policy "Admins and operations change technicians" on public.technicians
  for update to authenticated using (public.has_role('admin', 'operations')) with check (public.has_role('admin', 'operations'));
create policy "Admins delete technicians" on public.technicians
  for delete to authenticated using (public.has_role('admin'));

-- This project doesn't expose new tables to the API automatically.
grant select, insert, update, delete on public.crews to authenticated;
grant select, insert, update, delete on public.technicians to authenticated;
