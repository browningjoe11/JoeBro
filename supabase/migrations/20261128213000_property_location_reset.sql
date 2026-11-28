-- O3 map view: job sites keep their map position in properties.latitude/longitude
-- (looked up once from OpenStreetMap and saved by the app). When the address is
-- edited, the old position no longer matches, so it is cleared and the map looks
-- the new address up. An update that sets the position itself is left alone.

create or replace function public.properties_reset_location()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.street, new.city, new.state, coalesce(new.zip, ''))
       is distinct from (old.street, old.city, old.state, coalesce(old.zip, ''))
     and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    new.latitude := null;
    new.longitude := null;
  end if;
  return new;
end;
$$;

comment on function public.properties_reset_location() is
  'Clears a job site''s saved map position when its address changes, so the map looks it up again.';

create trigger properties_reset_location before update on public.properties
  for each row execute function public.properties_reset_location();
