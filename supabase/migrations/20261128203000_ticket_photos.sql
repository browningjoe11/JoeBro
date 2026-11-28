-- =====================================================================
-- Before and after photos (roadmap chunk M3)
--
--   ticket_photos   one row per photo on a ticket: tagged before or after,
--                   an optional caption, the picture's size, and where the
--                   two files sit in Storage (the photo, shrunk on the phone
--                   to at most 1600px, and a small thumbnail for lists).
--   Storage bucket "ticket-photos" (private): files live at
--                   <ticket id>/<photo id>.jpg and <ticket id>/<photo id>-thumb.jpg.
--                   The app shows them through short-lived signed links, so a
--                   photo of a customer's home is never on a public address.
--
-- Who can do what:
--   anyone who can see the ticket   sees its photos and adds new ones
--                                   (technicians: tickets assigned to them or
--                                   booked to their crew)
--   whoever took the photo          re-tags, captions or removes it
--   admin, operations               re-tag, caption or remove any photo
-- =====================================================================

create table public.ticket_photos (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.tickets (id) on delete cascade,
  tag          text not null,
  caption      text,
  path         text not null unique,
  thumb_path   text not null unique,
  width        integer,
  height       integer,
  bytes        integer,
  taken_at     timestamptz,
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ticket_photos_tag check (tag in ('before', 'after')),
  constraint ticket_photos_caption_short check (caption is null or length(caption) <= 280),
  -- Files sit in the ticket's own folder, so Storage can check access from the path alone.
  constraint ticket_photos_path_in_ticket check (split_part(path, '/', 1) = ticket_id::text and split_part(thumb_path, '/', 1) = ticket_id::text),
  -- About 2 MB is far above what the phone sends (a few hundred KB); it stops a full-size original slipping in.
  constraint ticket_photos_size check (bytes is null or bytes between 1 and 2097152)
);
comment on table public.ticket_photos is 'Before and after photos on a ticket. The files are in the private Storage bucket ticket-photos.';

create index ticket_photos_ticket_idx on public.ticket_photos (ticket_id, created_at);

create trigger ticket_photos_updated_at before update on public.ticket_photos
  for each row execute function public.set_updated_at();

-- Moving a photo to another ticket would leave its files in the old ticket's folder.
create or replace function public.ticket_photos_keep_place() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ticket_id is distinct from old.ticket_id or new.path is distinct from old.path
     or new.thumb_path is distinct from old.thumb_path or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'A photo stays on its ticket; add it again to another ticket instead.';
  end if;
  return new;
end;
$$;
create trigger ticket_photos_keep_place before update on public.ticket_photos
  for each row execute function public.ticket_photos_keep_place();

-- ---------- Access ----------------------------------------------------

-- True when the signed-in user can see the ticket with this id.
create or replace function public.can_see_ticket_id(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_see_ticket(t) from public.tickets t where t.id = tid), false);
$$;

-- Same, for a Storage path "<ticket id>/<file>". Compares as text so a
-- malformed path is simply refused instead of raising a cast error.
create or replace function public.can_see_ticket_folder(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.can_see_ticket(t) from public.tickets t
    where t.id::text = split_part(object_name, '/', 1)
  ), false);
$$;

-- True when the signed-in user may remove this Storage file: office roles
-- that run jobs, whoever took the photo, or anyone who can see the ticket
-- when no photo row points at the file (an upload that failed halfway).
create or replace function public.can_remove_photo_file(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_see_ticket_folder(object_name) and (
    public.has_role('admin', 'operations')
    or exists (
      select 1 from public.ticket_photos p
      where (p.path = object_name or p.thumb_path = object_name) and p.uploaded_by = auth.uid()
    )
    or not exists (
      select 1 from public.ticket_photos p
      where p.path = object_name or p.thumb_path = object_name
    )
  );
$$;

grant execute on function public.can_see_ticket_id(uuid), public.can_see_ticket_folder(text),
  public.can_remove_photo_file(text) to authenticated;

alter table public.ticket_photos enable row level security;

create policy "People see photos on tickets they can see" on public.ticket_photos
  for select to authenticated
  using (public.can_see_ticket_id(ticket_id));
create policy "People add photos to tickets they can see" on public.ticket_photos
  for insert to authenticated
  with check (public.can_see_ticket_id(ticket_id) and uploaded_by = auth.uid());
create policy "Uploader or office changes a photo" on public.ticket_photos
  for update to authenticated
  using (public.can_see_ticket_id(ticket_id) and (uploaded_by = auth.uid() or public.has_role('admin', 'operations')))
  with check (public.can_see_ticket_id(ticket_id) and (uploaded_by = auth.uid() or public.has_role('admin', 'operations')));
create policy "Uploader or office removes a photo" on public.ticket_photos
  for delete to authenticated
  using (public.can_see_ticket_id(ticket_id) and (uploaded_by = auth.uid() or public.has_role('admin', 'operations')));

-- This project doesn't expose new tables to the API automatically.
grant select, insert, update, delete on public.ticket_photos to authenticated;

-- ---------- Private photo bucket ---------------------------------------
-- Only where Storage exists (the plain test database has none). Not public:
-- every read goes through these policies, then a signed link that expires.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ticket-photos', 'ticket-photos', false, 2097152, array['image/jpeg', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/webp'];

    execute $p$create policy "People see photo files on tickets they can see" on storage.objects
      for select to authenticated using (bucket_id = 'ticket-photos' and public.can_see_ticket_folder(name))$p$;
    execute $p$create policy "People upload photo files to tickets they can see" on storage.objects
      for insert to authenticated with check (bucket_id = 'ticket-photos' and public.can_see_ticket_folder(name))$p$;
    execute $p$create policy "Uploader or office removes photo files" on storage.objects
      for delete to authenticated using (bucket_id = 'ticket-photos' and public.can_remove_photo_file(name))$p$;
  end if;
end
$$;
