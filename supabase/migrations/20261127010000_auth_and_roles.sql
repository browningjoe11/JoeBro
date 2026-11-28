-- =====================================================================
-- Sign-in and role rules (roadmap chunk F4)
-- Replaces the F3 "any active user" policies with per-role access.
--
--   Role        Sees                                Can change tickets in stages
--   admin       everything                          any
--   sales       all customers and tickets           lead → signed, lost
--   operations  all customers and tickets           signed → review, lost
--   reviewer    all customers and tickets           onsite (send back), review → paid
--   technician  only tickets assigned to them,      scheduled → review, on their own tickets
--               and those tickets' customers
-- =====================================================================

-- ---------- Who is signed in ------------------------------------------

-- Role of the signed-in user, or null if they have no active profile.
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = any (roles), false);
$$;

-- Ticket stages each role may work in (both the stage a ticket is in and the stage it moves to).
create or replace function public.role_can_edit_stage(r public.app_role, s public.ticket_stage) returns boolean
language sql immutable as $$
  select case r
    when 'admin'      then true
    when 'sales'      then s in ('lead', 'site_visit', 'estimating', 'estimate_sent', 'signed', 'lost')
    when 'operations' then s in ('signed', 'scheduling', 'scheduled', 'onsite', 'review', 'lost')
    when 'technician' then s in ('scheduled', 'onsite', 'review')
    when 'reviewer'   then s in ('onsite', 'review', 'invoicing', 'paid')
    else false
  end;
$$;

-- True when the signed-in user may see this ticket.
create or replace function public.can_see_ticket(t public.tickets) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when r is null then false
    when r = 'technician' then coalesce(t.assigned_to = auth.uid(), false)
    else true
  end
  from (select public.current_app_role() as r) me;
$$;

-- True when the signed-in technician has a ticket for this customer.
create or replace function public.tech_has_contact(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets where contact_id = cid and assigned_to = auth.uid());
$$;

-- ---------- New sign-ins get a profile --------------------------------

-- The very first person to sign up becomes admin; everyone after starts as a
-- technician with no access until an admin activates them and sets their role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_user boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when first_user then 'admin'::public.app_role else 'technician'::public.app_role end,
    first_user
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone who already signed up before this migration gets a profile the same way
-- (oldest account first, so the owner's login becomes the admin).
insert into public.profiles (id, email, full_name, role, active)
select u.id,
       lower(u.email),
       coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
       case when u.n = 1 and not exists (select 1 from public.profiles) then 'admin'::public.app_role else 'technician'::public.app_role end,
       u.n = 1 and not exists (select 1 from public.profiles)
from (select *, row_number() over (order by created_at, id) as n from auth.users) u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Only admins change roles or turn accounts on and off, and the last active
-- admin can't be removed (so nobody gets locked out of Settings).
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if auth.uid() is not null and not public.has_role('admin') then
      raise exception 'Only an admin can change roles or activate accounts' using errcode = 'insufficient_privilege';
    end if;
    if old.role = 'admin' and old.active and not (new.role = 'admin' and new.active)
       and not exists (select 1 from public.profiles where role = 'admin' and active and id <> old.id) then
      raise exception 'Keep at least one active admin' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- Replace F3 policies ---------------------------------------

drop policy "Users read their own profile" on public.profiles;
drop policy "Active users read and write contacts" on public.contacts;
drop policy "Active users read and write properties" on public.properties;
drop policy "Active users read and write tickets" on public.tickets;
drop policy "Active users read ticket history" on public.ticket_events;
drop policy "Active users add notes" on public.ticket_events;

-- Profiles: everyone active can see the team list (for assigning work); you can
-- always see yourself; you can edit your own name and phone; admins edit anyone.
create policy "Read own profile or team list" on public.profiles
  for select to authenticated using (id = auth.uid() or public.current_app_role() is not null);
create policy "Edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Admins edit any profile" on public.profiles
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- Contacts and properties
create policy "Office roles read contacts" on public.contacts
  for select to authenticated using (public.has_role('admin', 'sales', 'operations', 'reviewer'));
create policy "Technicians read their customers" on public.contacts
  for select to authenticated using (public.has_role('technician') and public.tech_has_contact(id));
create policy "Office roles add contacts" on public.contacts
  for insert to authenticated with check (public.has_role('admin', 'sales', 'operations'));
create policy "Office roles edit contacts" on public.contacts
  for update to authenticated using (public.has_role('admin', 'sales', 'operations'))
  with check (public.has_role('admin', 'sales', 'operations'));
create policy "Admins delete contacts" on public.contacts
  for delete to authenticated using (public.has_role('admin'));

create policy "Office roles read properties" on public.properties
  for select to authenticated using (public.has_role('admin', 'sales', 'operations', 'reviewer'));
create policy "Technicians read their job sites" on public.properties
  for select to authenticated using (public.has_role('technician') and public.tech_has_contact(contact_id));
create policy "Office roles add properties" on public.properties
  for insert to authenticated with check (public.has_role('admin', 'sales', 'operations'));
create policy "Office roles edit properties" on public.properties
  for update to authenticated using (public.has_role('admin', 'sales', 'operations'))
  with check (public.has_role('admin', 'sales', 'operations'));
create policy "Admins delete properties" on public.properties
  for delete to authenticated using (public.has_role('admin'));

-- Tickets
create policy "Read tickets you may see" on public.tickets
  for select to authenticated using (public.can_see_ticket(tickets));
create policy "Office roles create tickets" on public.tickets
  for insert to authenticated with check (public.has_role('admin', 'sales', 'operations'));
create policy "Edit tickets in your stages" on public.tickets
  for update to authenticated
  using (public.can_see_ticket(tickets) and public.role_can_edit_stage(public.current_app_role(), stage))
  with check (public.can_see_ticket(tickets) and public.role_can_edit_stage(public.current_app_role(), stage));
create policy "Admins delete tickets" on public.tickets
  for delete to authenticated using (public.has_role('admin'));

-- Ticket history: visible with the ticket; anyone who can see a ticket can add a note.
create policy "Read history of tickets you may see" on public.ticket_events
  for select to authenticated using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy "Add notes to tickets you may see" on public.ticket_events
  for insert to authenticated
  with check (kind = 'note' and actor_id = auth.uid() and exists (select 1 from public.tickets t where t.id = ticket_id));
