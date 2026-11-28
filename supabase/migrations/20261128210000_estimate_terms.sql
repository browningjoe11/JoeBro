-- =====================================================================
-- Customer estimate document (roadmap chunk S4)
--
--   company_settings.estimate_terms        the terms printed at the bottom
--                                          of every customer estimate
--                                          (web page and PDF). Admins edit
--                                          it in Settings > Company profile.
--   company_settings.estimate_valid_days   how many days a price holds,
--                                          printed as "Valid until <date>".
--
-- The estimate itself is drawn from a saved estimate_versions row (S3), so
-- no new tables. company_settings is already granted to authenticated and
-- its row-level security (everyone reads, admins change) covers the new
-- columns.
-- =====================================================================

alter table public.company_settings
  add column estimate_terms text not null default
    'The price above covers the labor, materials and cleanup for the work described. Anything not listed is not included.' || E'\n' ||
    'Changes to the work are priced and agreed in writing before they are done.' || E'\n' ||
    'Hidden conditions found once work begins (such as rot or damage behind walls) are shown to you and priced before any extra work.' || E'\n' ||
    'Payment terms are set out when you accept this estimate.',
  add column estimate_valid_days integer not null default 30,
  add constraint company_settings_estimate_terms_length check (length(estimate_terms) <= 5000),
  add constraint company_settings_estimate_valid_days check (estimate_valid_days between 1 and 365);

comment on column public.company_settings.estimate_terms is 'Terms printed on every customer estimate. One paragraph per line.';
comment on column public.company_settings.estimate_valid_days is 'Days an estimate price holds after the version is saved.';
