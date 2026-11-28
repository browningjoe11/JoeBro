-- Sample data so every screen has something to show while it's being built.
-- Every row is marked is_example = true and can be removed in one step:
--   delete from public.calendar_events where is_example; delete from public.tickets where is_example; delete from public.contacts where is_example;
-- Safe to run more than once (fixed ids, on conflict do nothing).

insert into public.contacts (id, first_name, last_name, email, phone, preferred_contact, lead_source, notes, is_example) values
  ('00000000-0000-4000-a000-000000000001', 'Dana',   'Whitfield', 'dana.whitfield@example.com', '(302) 555-0142', 'text',  'Google',          'Prefers texts after 5 PM.', true),
  ('00000000-0000-4000-a000-000000000002', 'Marcus', 'Reyes',     'mreyes@example.com',         '302-555-0187',   'phone', 'Referral',        null, true),
  ('00000000-0000-4000-a000-000000000003', 'Elaine', 'Porter',    'elaine.porter@example.com',  '302.555.0119',   'email', 'Repeat customer', 'Owns a rental in Rehoboth too.', true),
  ('00000000-0000-4000-a000-000000000004', 'Tom',    'Kowalski',  null,                         '(302) 555-0163', 'phone', 'Yard sign',       null, true)
on conflict (id) do nothing;

insert into public.properties (id, contact_id, label, street, city, state, zip, county, is_primary, access_notes) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'Home',   '118 Fox Hall Dr',      'Dover',          'DE', '19904', 'Kent',   true,  'Dog in back yard.'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002', 'Home',   '42 NW Front St',       'Milford',        'DE', '19963', 'Kent',   true,  null),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000003', 'Home',   '9 Pilottown Rd',       'Lewes',          'DE', '19958', 'Sussex', true,  null),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000003', 'Rental', '27 Delaware Ave',      'Rehoboth Beach', 'DE', '19971', 'Sussex', false, 'Lockbox code from owner.'),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000004', 'Home',   '310 Walnut Shade Rd',  'Camden',         'DE', '19934', 'Kent',   true,  null)
on conflict (id) do nothing;

insert into public.tickets (id, contact_id, property_id, title, trade, scope, stage, lead_source, estimated_value, next_action_at, lost_reason, is_example) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001',
   'Rebuild 12×16 back deck', 'Carpentry', 'Remove existing deck boards and rebuild 12×16 deck with composite boards on new joists.',
   'estimate_sent', 'Google', 12480.00, now() + interval '2 days', null, true),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000002',
   'Replace storm-damaged siding', 'Siding', 'Replace about 300 sq ft of vinyl siding on the north wall and wrap two windows.',
   'site_visit', 'Referral', null, now() + interval '1 day', null, true),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000004',
   'Bathroom refresh at rental', 'Remodel', 'New vanity, toilet, LVP flooring and paint in the hall bathroom.',
   'scheduling', 'Repeat customer', 6850.00, now() + interval '3 days', null, true),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000005',
   'Fence repair', 'Fencing', 'Replace six rotted fence pickets and one post.',
   'lead', 'Yard sign', null, now(), null, true),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000003',
   'Screened porch addition', 'Carpentry', 'Screened porch on existing patio.',
   'lost', 'Repeat customer', 18900.00, null, 'Timing: customer postponed to next year.', true)
on conflict (id) do nothing;

-- Calendar (S8): a few bookings in the current week, Delaware time (Monday = start of week).
insert into public.calendar_events (id, kind, status, title, starts_at, ends_at, ticket_id, notes, is_example)
select v.id::uuid, v.kind::public.calendar_event_kind, v.status::public.calendar_event_status, v.title,
       (w.monday + v.starts) at time zone 'America/New_York',
       (w.monday + v.ends) at time zone 'America/New_York',
       v.ticket_id::uuid, v.notes, true
from (select date_trunc('week', now() at time zone 'America/New_York') as monday) w,
(values
  ('00000000-0000-4000-d000-000000000001', 'other',      'confirmed', 'Supplier pickup at lumber yard',  interval '7 hours',          interval '8 hours',            null::text,                             'Composite boards for the deck.'),
  ('00000000-0000-4000-d000-000000000002', 'site_visit', 'confirmed', 'Site visit: storm-damaged siding', interval '1 day 9 hours',   interval '1 day 10 hours',     '00000000-0000-4000-c000-000000000002', 'Measure the north wall.'),
  ('00000000-0000-4000-d000-000000000003', 'job',        'tentative', 'Bathroom refresh at rental',       interval '2 days 8 hours',  interval '2 days 16 hours',    '00000000-0000-4000-c000-000000000003', 'Pencilled in, waiting on vanity delivery.'),
  ('00000000-0000-4000-d000-000000000004', 'job',        'tentative', 'Bathroom refresh at rental',       interval '3 days 8 hours',  interval '3 days 12 hours',    '00000000-0000-4000-c000-000000000003', null),
  ('00000000-0000-4000-d000-000000000005', 'site_visit', 'confirmed', 'Site visit: fence repair',         interval '3 days 13 hours', interval '3 days 14 hours',    '00000000-0000-4000-c000-000000000004', null)
) as v(id, kind, status, title, starts, ends, ticket_id, notes)
on conflict (id) do nothing;
