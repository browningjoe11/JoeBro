-- =====================================================================
-- Settings (roadmap chunk F5)
--   company_settings  one row: company profile, logo, modules switched off
--   option_lists      admin-editable dropdown lists (lead sources, trades)
-- Everyone signed in and switched on can read them (the whole app shows the
-- company name and hides switched-off modules); only admins change them.
-- =====================================================================

create table public.company_settings (
  id                boolean primary key default true,
  name              text not null default 'Joebros Contracting Services',
  license_number    text,
  phone             text,
  email             text,
  website           text,
  street            text,
  city              text,
  state             text not null default 'DE',
  zip               text,
  -- Small image stored inline (resized in the browser to at most 256px), so no
  -- file storage is needed for one logo.
  logo_data_url     text,
  -- Module ids an admin has switched off, e.g. {'onsite'}. Settings and the
  -- dashboard can't be switched off.
  disabled_modules  text[] not null default '{}',
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null,
  constraint company_settings_single_row check (id),
  constraint company_settings_name check (length(btrim(name)) > 0),
  constraint company_settings_logo_size check (logo_data_url is null or (logo_data_url like 'data:image/%' and length(logo_data_url) <= 300000)),
  constraint company_settings_core_modules check (not (disabled_modules && array['settings', 'dashboard']))
);
comment on table public.company_settings is 'Company profile and app-wide switches. Exactly one row.';

create trigger company_settings_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();

insert into public.company_settings (id) values (true) on conflict (id) do nothing;

create table public.option_lists (
  id          uuid primary key default gen_random_uuid(),
  list        text not null,
  label       text not null,
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint option_lists_list check (list in ('lead_source', 'trade')),
  constraint option_lists_label check (length(btrim(label)) > 0)
);
comment on table public.option_lists is 'Dropdown choices admins can edit. Hidden (active = false) choices stay on old records.';

create unique index option_lists_unique_label on public.option_lists (list, lower(btrim(label)));

insert into public.option_lists (list, label, sort) values
  ('lead_source', 'Google', 10),
  ('lead_source', 'Facebook', 20),
  ('lead_source', 'Referral', 30),
  ('lead_source', 'Repeat customer', 40),
  ('lead_source', 'Yard sign', 50),
  ('lead_source', 'Truck or vehicle', 60),
  ('lead_source', 'Other', 90),
  ('trade', 'Carpentry', 10),
  ('trade', 'Decks', 20),
  ('trade', 'Siding', 30),
  ('trade', 'Roofing', 40),
  ('trade', 'Remodel', 50),
  ('trade', 'Fencing', 60),
  ('trade', 'Painting', 70),
  ('trade', 'Drywall', 80),
  ('trade', 'Flooring', 90),
  ('trade', 'Other', 990)
on conflict do nothing;

-- ---------- Access ----------------------------------------------------

alter table public.company_settings enable row level security;
alter table public.option_lists enable row level security;

create policy "Active users read company settings" on public.company_settings
  for select to authenticated using (public.current_app_role() is not null);
create policy "Admins edit company settings" on public.company_settings
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "Active users read lists" on public.option_lists
  for select to authenticated using (public.current_app_role() is not null);
create policy "Admins add list choices" on public.option_lists
  for insert to authenticated with check (public.has_role('admin'));
create policy "Admins edit list choices" on public.option_lists
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Admins delete list choices" on public.option_lists
  for delete to authenticated using (public.has_role('admin'));

grant select, update on public.company_settings to authenticated;
grant select, insert, update, delete on public.option_lists to authenticated;

-- ---------- Team list for the Users screen ----------------------------

-- Profiles plus sign-in status from Supabase Auth (invite accepted? last
-- sign-in?). Returns nothing unless the caller is an admin.
create or replace function public.admin_team_list()
returns table (
  id uuid, email text, full_name text, phone text, role public.app_role, active boolean,
  invited_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.email, p.full_name, p.phone, p.role, p.active,
         u.invited_at, u.email_confirmed_at, u.last_sign_in_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where public.has_role('admin')
  order by lower(coalesce(nullif(p.full_name, ''), p.email));
$$;
revoke execute on function public.admin_team_list() from public, anon;
grant execute on function public.admin_team_list() to authenticated;
