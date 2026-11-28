-- =====================================================================
-- Let signed-in users reach the tables through the API (fix for F4)
--
-- This Supabase project doesn't expose new tables to the API roles
-- automatically, so signed-in users got "permission denied for table
-- profiles". Grant table access to signed-in users only; row-level
-- security (20261127010000_auth_and_roles.sql) decides which rows each
-- role actually sees or changes. Visitors who aren't signed in (anon)
-- get nothing.
--
-- Every future migration that adds a table must grant it the same way.
-- =====================================================================

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, update, delete on public.tickets to authenticated;
grant select, insert on public.ticket_events to authenticated;
grant select on public.ticket_stage_transitions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Helpers that the access rules and triggers call.
grant execute on function
  public.current_app_role(),
  public.has_role(public.app_role[]),
  public.role_can_edit_stage(public.app_role, public.ticket_stage),
  public.can_see_ticket(public.tickets),
  public.tech_has_contact(uuid),
  public.is_active_user(),
  public.normalize_phone(text)
to authenticated;
