-- =====================================================================
-- Contact change log (roadmap chunk C2)
--
-- Phone, email and address live only on the customer (contacts) and
-- their job sites (properties). Tickets point at them, so an edit made
-- from any ticket shows on the contact page and every other ticket.
-- This migration records who changed what, and when, so a wrong number
-- can be traced and put back.
-- =====================================================================

create table public.contact_changes (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  -- Set when the change was to one of the customer's job sites.
  property_id uuid references public.properties (id) on delete set null,
  actor_id    uuid references public.profiles (id) on delete set null,
  -- {"phone": {"from": "302-555-0142", "to": "302-555-0199"}, ...}
  -- A new job site is logged as {"site_added": {"from": null, "to": "118 Fox Hall Dr, Dover"}}.
  changes     jsonb not null,
  created_at  timestamptz not null default now(),
  constraint contact_changes_not_empty check (changes <> '{}'::jsonb)
);
comment on table public.contact_changes is 'Who changed a customer''s contact details or job sites, and when. Written by triggers only.';

create index contact_changes_contact_idx on public.contact_changes (contact_id, created_at desc);

-- Writes one log row per save, listing each field that actually changed.
create or replace function public.log_contact_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  changes jsonb := '{}'::jsonb;
  col text;
  cols text[];
begin
  -- Only reference a profile that exists (imports and service jobs have none).
  if actor is not null and not exists (select 1 from public.profiles where id = actor) then
    actor := null;
  end if;

  if tg_table_name = 'properties' and tg_op = 'INSERT' then
    -- A customer's first site, or sites added while creating them (imports, sample data), are not changes.
    if exists (select 1 from public.properties where contact_id = new.contact_id and id <> new.id)
       and exists (select 1 from public.contacts where id = new.contact_id and created_at < now()) then
      insert into public.contact_changes (contact_id, property_id, actor_id, changes)
      values (new.contact_id, new.id, actor,
              jsonb_build_object('site_added', jsonb_build_object('from', null, 'to', concat_ws(', ', new.street, new.city))));
    end if;
    return new;
  end if;

  if tg_table_name = 'contacts' then
    cols := array['first_name', 'last_name', 'company', 'phone', 'phone_alt', 'email', 'preferred_contact'];
  else
    cols := array['label', 'street', 'unit', 'city', 'state', 'zip', 'county', 'access_notes'];
  end if;

  foreach col in array cols loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      changes := changes || jsonb_build_object(col, jsonb_build_object('from', to_jsonb(old) -> col, 'to', to_jsonb(new) -> col));
    end if;
  end loop;

  if changes <> '{}'::jsonb then
    if tg_table_name = 'contacts' then
      insert into public.contact_changes (contact_id, actor_id, changes) values (new.id, actor, changes);
    else
      insert into public.contact_changes (contact_id, property_id, actor_id, changes) values (new.contact_id, new.id, actor, changes);
    end if;
  end if;
  return new;
end;
$$;

create trigger contacts_log_change after update on public.contacts
  for each row execute function public.log_contact_change();
create trigger properties_log_change after insert or update on public.properties
  for each row execute function public.log_contact_change();

-- ---------- Access ----------------------------------------------------
-- Readable by anyone who can see the customer. Nobody writes it directly.

alter table public.contact_changes enable row level security;

create policy "Read changes for customers you may see" on public.contact_changes
  for select to authenticated using (exists (select 1 from public.contacts c where c.id = contact_id));

grant select on public.contact_changes to authenticated;
