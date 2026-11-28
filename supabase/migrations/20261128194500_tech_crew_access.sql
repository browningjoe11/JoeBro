-- =====================================================================
-- Techs see their crew's jobs (roadmap chunk M1, My Day)
--
-- The scheduling board (O2) books jobs to a crew, not to a person. Until now
-- a technician only saw tickets assigned to them personally, so a tech whose
-- login is linked to a crew (technicians.profile_id) saw none of the crew's
-- work. Now a technician also sees:
--   * calendar bookings for their crew,
--   * the tickets those bookings are for (and so can move them
--     scheduled -> onsite -> review, as F4 already allows on their own tickets),
--   * those tickets' customers and job sites (phone and address for My Day).
-- Office roles are unchanged.
-- =====================================================================

-- Crews the signed-in user works on (through their active technician record).
create or replace function public.my_crew_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select crew_id from public.technicians
  where profile_id = auth.uid() and active and crew_id is not null;
$$;

-- True when a calendar booking for this ticket is assigned to the signed-in
-- user or to their crew.
create or replace function public.tech_booked_on(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
        select 1 from public.calendar_events e
        where e.ticket_id = tid
          and (e.assigned_to = auth.uid() or e.crew_id in (select public.my_crew_ids()))
      );
$$;

create or replace function public.can_see_ticket(t public.tickets) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when r is null then false
    -- Reads the row itself for assigned_to (not the table), so a tech can't
    -- un-assign a ticket and still pass the check on the new row.
    when r = 'technician' then coalesce(t.assigned_to = auth.uid(), false) or public.tech_booked_on(t.id)
    else true
  end
  from (select public.current_app_role() as r) me;
$$;

create or replace function public.tech_has_contact(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets t
    where t.contact_id = cid and (t.assigned_to = auth.uid() or public.tech_booked_on(t.id))
  );
$$;

create or replace function public.tech_on_event(e public.calendar_events) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(e.assigned_to = auth.uid(), false)
      or coalesce(e.crew_id in (select public.my_crew_ids()), false)
      or exists (select 1 from public.tickets t where t.id = e.ticket_id and t.assigned_to = auth.uid());
$$;

grant execute on function public.my_crew_ids(), public.tech_booked_on(uuid) to authenticated;

-- A crew tech passes the ticket check through the crew's booking, so the check
-- alone no longer stops them handing the ticket to someone else. Only office
-- roles assign tickets.
create or replace function public.tickets_assign_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is distinct from old.assigned_to and public.current_app_role() = 'technician' then
    raise exception 'new row violates row-level security policy: technicians can''t reassign tickets'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger tickets_assign_guard before update of assigned_to on public.tickets
  for each row execute function public.tickets_assign_guard();
