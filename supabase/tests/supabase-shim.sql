-- Test-only stand-in for what Supabase provides out of the box, so migrations
-- can be checked in an in-memory Postgres (PGlite) without a Supabase project.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  invited_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- Like a current Supabase project: the API roles can use the schema, but new tables
-- and functions are NOT exposed to them automatically. Each migration grants what
-- the app needs (see 20261128000000_api_grants.sql); row-level security then filters rows.
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
