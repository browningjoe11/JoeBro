-- =====================================================================
-- Import from the old Joebros CRM (roadmap chunk F8)
--
-- Rows brought over are tagged import_source = 'joebros-crm' plus the id
-- they had in the export (import_key), so running the same file again does
-- not create a second copy. import_links remembers the match when a row in
-- the file belonged to a customer who was already here (same phone or email),
-- because that existing row keeps its own source empty.
--
-- A job from the old CRM may already be past the early stages. An admin
-- insert that carries import_source may start at any stage. Everyone else
-- still starts at lead, site visit, or estimating. Sample rows (is_example)
-- are unchanged.
-- =====================================================================

-- ---------- Source tag on the rows the import creates -----------------

alter table public.contacts
  add column import_source text,
  add column import_key text;
alter table public.properties
  add column import_source text,
  add column import_key text;
alter table public.tickets
  add column import_source text,
  add column import_key text;
alter table public.ticket_events
  add column import_source text,
  add column import_key text;

comment on column public.contacts.import_source is 'Set when the row was imported (joebros-crm). Empty for rows created in this app.';
comment on column public.contacts.import_key is 'Id from the export file. Together with import_source, a second import of the same file finds this row.';

alter table public.contacts
  add constraint contacts_import_source check (import_source is null or import_source ~ '^[a-z][a-z0-9-]{0,40}$'),
  add constraint contacts_import_key check (import_key is null or length(btrim(import_key)) > 0),
  add constraint contacts_import_pair check ((import_source is null) = (import_key is null));
alter table public.properties
  add constraint properties_import_source check (import_source is null or import_source ~ '^[a-z][a-z0-9-]{0,40}$'),
  add constraint properties_import_key check (import_key is null or length(btrim(import_key)) > 0),
  add constraint properties_import_pair check ((import_source is null) = (import_key is null));
alter table public.tickets
  add constraint tickets_import_source check (import_source is null or import_source ~ '^[a-z][a-z0-9-]{0,40}$'),
  add constraint tickets_import_key check (import_key is null or length(btrim(import_key)) > 0),
  add constraint tickets_import_pair check ((import_source is null) = (import_key is null));
alter table public.ticket_events
  add constraint ticket_events_import_source check (import_source is null or import_source ~ '^[a-z][a-z0-9-]{0,40}$'),
  add constraint ticket_events_import_key check (import_key is null or length(btrim(import_key)) > 0),
  add constraint ticket_events_import_pair check ((import_source is null) = (import_key is null));

create unique index contacts_import_key_uidx on public.contacts (import_source, import_key) where import_source is not null;
create unique index properties_import_key_uidx on public.properties (import_source, import_key) where import_source is not null;
create unique index tickets_import_key_uidx on public.tickets (import_source, import_key) where import_source is not null;
create unique index ticket_events_import_key_uidx on public.ticket_events (import_source, import_key) where import_source is not null;

-- Signed-in users who are not admins can still edit an imported customer.
-- They cannot stamp a row as imported, or strip that stamp.
create or replace function public.reject_unprivileged_import() returns trigger
language plpgsql as $$
begin
  if new.import_source is null and (tg_op = 'INSERT' or old.import_source is null) then
    return new;
  end if;
  if auth.uid() is null or public.has_role('admin') then
    return new;
  end if;
  if tg_op = 'INSERT'
     or new.import_source is distinct from old.import_source
     or new.import_key is distinct from old.import_key then
    raise exception 'Only an admin can mark imported records'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger contacts_reject_import before insert or update on public.contacts
  for each row execute function public.reject_unprivileged_import();
create trigger properties_reject_import before insert or update on public.properties
  for each row execute function public.reject_unprivileged_import();
create trigger tickets_reject_import before insert or update on public.tickets
  for each row execute function public.reject_unprivileged_import();
create trigger ticket_events_reject_import before insert or update on public.ticket_events
  for each row execute function public.reject_unprivileged_import();

-- Historical jobs may already be scheduled, on site, or paid.
create or replace function public.tickets_enforce_stage() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.stage not in ('lead', 'site_visit', 'estimating') and not new.is_example then
      if not (new.import_source is not null and (auth.uid() is null or public.has_role('admin'))) then
        raise exception 'New tickets start at lead, site_visit or estimating, not %', new.stage
          using errcode = 'check_violation';
      end if;
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

-- An imported note has no actor in the old CRM. Admins may record it that way.
drop policy "Add notes to tickets you may see" on public.ticket_events;
create policy "Add notes to tickets you may see" on public.ticket_events
  for insert to authenticated
  with check (
    kind = 'note'
    and exists (select 1 from public.tickets t where t.id = ticket_id)
    and (
      actor_id = auth.uid()
      or (import_source is not null and actor_id is null and public.has_role('admin'))
    )
  );

-- ---------- Which export id became which row --------------------------

create table public.import_links (
  source            text not null,
  entity            text not null,
  import_key        text not null,
  record_id         uuid not null,
  matched_existing  boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (source, entity, import_key),
  constraint import_links_source check (source ~ '^[a-z][a-z0-9-]{0,40}$'),
  constraint import_links_entity check (entity in ('contact', 'property', 'ticket', 'note')),
  constraint import_links_key check (length(btrim(import_key)) > 0)
);
comment on table public.import_links is 'Maps an id from an old-CRM export to the row it became, including matches onto customers who were already in the app. A second import of the same file reads this and adds nothing.';

alter table public.import_links enable row level security;
create policy "Admins read import links" on public.import_links
  for select to authenticated using (public.has_role('admin'));
create policy "Admins record import links" on public.import_links
  for insert to authenticated with check (public.has_role('admin'));

grant select, insert on public.import_links to authenticated;
