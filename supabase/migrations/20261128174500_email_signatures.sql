-- =====================================================================
-- Email signatures (roadmap chunk S5)
--
--   email_signatures   one signature per app login: the person's name,
--                      title, direct phone and email, which company details
--                      to show (logo, office phone, website, address,
--                      license number), an optional closing line and an
--                      accent color. Estimate emails (S6) add it to every
--                      email that person sends.
--   company_settings.email_logo_url
--                      a public web address for the company logo. Gmail and
--                      Outlook won't show an image stored inside the email
--                      itself, so the logo is copied to a public Storage
--                      bucket ("branding") whenever an admin saves it.
--
-- Who can do what:
--   everyone signed in and switched on   reads and changes their own signature
--   admin                                reads and changes everyone's
-- =====================================================================

create table public.email_signatures (
  profile_id          uuid primary key references public.profiles (id) on delete cascade,
  full_name           text not null,
  title               text,
  phone               text,
  mobile              text,
  email               text,
  tagline             text,
  -- Same names as the palette tokens (--ev-<name>); emails use fixed hex values for them.
  accent              text not null default 'teal',
  show_logo           boolean not null default true,
  show_company_phone  boolean not null default true,
  show_website        boolean not null default true,
  show_address        boolean not null default false,
  show_license        boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint email_signatures_name_present check (length(btrim(full_name)) > 0),
  constraint email_signatures_accent_known check (accent in ('teal', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'slate')),
  constraint email_signatures_email_shape check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint email_signatures_tagline_short check (tagline is null or length(tagline) <= 140)
);
comment on table public.email_signatures is 'One email signature per login, added to estimate and invoice emails that person sends.';

create trigger email_signatures_updated_at before update on public.email_signatures
  for each row execute function public.set_updated_at();

alter table public.company_settings add column email_logo_url text;
comment on column public.company_settings.email_logo_url is 'Public web address of the logo for emails (Gmail and Outlook block images stored inside the email).';

-- ---------- Access ----------------------------------------------------

alter table public.email_signatures enable row level security;

create policy "People read their own signature, admins read all" on public.email_signatures
  for select to authenticated
  using (public.current_app_role() is not null and (profile_id = auth.uid() or public.has_role('admin')));
create policy "People add their own signature, admins add any" on public.email_signatures
  for insert to authenticated
  with check (public.current_app_role() is not null and (profile_id = auth.uid() or public.has_role('admin')));
create policy "People change their own signature, admins change any" on public.email_signatures
  for update to authenticated
  using (public.current_app_role() is not null and (profile_id = auth.uid() or public.has_role('admin')))
  with check (public.current_app_role() is not null and (profile_id = auth.uid() or public.has_role('admin')));
create policy "People remove their own signature, admins remove any" on public.email_signatures
  for delete to authenticated
  using (public.current_app_role() is not null and (profile_id = auth.uid() or public.has_role('admin')));

-- This project doesn't expose new tables to the API automatically.
grant select, insert, update, delete on public.email_signatures to authenticated;

-- ---------- Public logo bucket ----------------------------------------
-- Only on a real Supabase database (the test database has no Storage).
-- Anyone can view files in "branding" by their public address (emails need
-- that); only admins upload, replace or remove them.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg'])
    on conflict (id) do update set public = true;

    execute $p$create policy "Admins upload branding" on storage.objects
      for insert to authenticated with check (bucket_id = 'branding' and public.has_role('admin'))$p$;
    execute $p$create policy "Admins replace branding" on storage.objects
      for update to authenticated using (bucket_id = 'branding' and public.has_role('admin'))
      with check (bucket_id = 'branding' and public.has_role('admin'))$p$;
    execute $p$create policy "Admins remove branding" on storage.objects
      for delete to authenticated using (bucket_id = 'branding' and public.has_role('admin'))$p$;
  end if;
end
$$;
