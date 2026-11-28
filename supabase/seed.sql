-- Sample data so every screen has something to show while it's being built.
-- Every row is marked is_example = true and can be removed in one step:
--   delete from public.tickets where is_example; delete from public.contacts where is_example;
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

-- Starter price book (chunk S1). Example numbers only: edit or retire them in Price book.
--   delete from public.price_items where is_example;
insert into public.price_items (id, kind, name, description, trade, unit, price, markup_pct, factor, applies_to, is_example) values
  ('00000000-0000-4000-e000-000000000001', 'labor',      'Carpenter',               'Lead carpenter, per hour.',                         'Carpentry', 'hr',    75.00, null, null,  null,        true),
  ('00000000-0000-4000-e000-000000000002', 'labor',      'Helper',                  'General labor and cleanup, per hour.',              null,        'hr',    45.00, null, null,  null,        true),
  ('00000000-0000-4000-e000-000000000003', 'labor',      'Painter',                 null,                                                'Painting',  'hr',    60.00, null, null,  null,        true),
  ('00000000-0000-4000-e000-000000000004', 'material',   'Composite deck board 16 ft', 'Grooved edge, includes hidden fasteners.',       'Decks',     'ea',    52.00, 20,   null,  null,        true),
  ('00000000-0000-4000-e000-000000000005', 'material',   'Pressure-treated 2×10×12', 'Joist stock.',                                     'Decks',     'ea',    24.50, 20,   null,  null,        true),
  ('00000000-0000-4000-e000-000000000006', 'material',   'Vinyl siding',            'Double 4 in, per square foot installed area.',      'Siding',    'sq ft',  1.85, 25,   null,  null,        true),
  ('00000000-0000-4000-e000-000000000007', 'material',   'Drywall sheet 4×8 ½ in',  null,                                                'Drywall',   'ea',    15.00, 25,   null,  null,        true),
  ('00000000-0000-4000-e000-000000000008', 'adder',      'Building permit',         'County permit and inspection fees.',               null,        'job',  150.00, null, null,  null,        true),
  ('00000000-0000-4000-e000-000000000009', 'adder',      'Dump trailer load',       'Haul-away and disposal of debris.',                null,        'load', 225.00, null, null,  null,        true),
  ('00000000-0000-4000-e000-000000000010', 'adder',      'Travel beyond 30 miles',  'Charged per mile past the free zone.',             null,        'mile',   1.50, null, null,  null,        true),
  ('00000000-0000-4000-e000-000000000011', 'multiplier', 'Difficult access',        'Tight crawlspace, steep lot or no truck access.',  null,        null,     null, null, 1.150, 'labor',     true),
  ('00000000-0000-4000-e000-000000000012', 'multiplier', 'Second-story height',     'Ladders or staging above 12 ft.',                  null,        null,     null, null, 1.200, 'labor',     true),
  ('00000000-0000-4000-e000-000000000013', 'multiplier', 'Rush job',                'Start within a week or after-hours work.',         null,        null,     null, null, 1.100, 'total',     true)
on conflict (id) do nothing;
