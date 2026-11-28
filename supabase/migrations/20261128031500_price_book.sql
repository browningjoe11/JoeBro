-- =====================================================================
-- Price book (roadmap chunk S1)
--
-- One list of everything an estimate is priced from:
--   labor       hourly rates            price = $ per hour
--   material    things you buy          price = your cost per unit, markup_pct = default markup
--   adder       extra charges           price = $ per unit ("job" for a flat fee, "load", "mile", ...)
--               (permits, disposal, travel)
--   multiplier  adjustments             factor = e.g. 1.15 for +15%, applies_to = labor/materials/total
--               (difficulty, height, rush)
--
-- Estimates (S3) copy the name, unit and numbers onto each line when an item
-- is picked, so changing a price here never changes an estimate already
-- written. Items are retired (active = false), never deleted, so old
-- estimates can still point back at them.
--
-- Admins add and edit items. Sales, operations and reviewers read them
-- (estimating, job costing, review). Technicians don't see prices.
-- =====================================================================

create type public.price_kind as enum ('labor', 'material', 'adder', 'multiplier');

create table public.price_items (
  id           uuid primary key default gen_random_uuid(),
  kind         public.price_kind not null,
  name         text not null,
  description  text,
  -- Optional: limits the item to one trade (from the Trades list) when picking. Null = any trade.
  trade        text,
  -- "hr", "sq ft", "ea", "job", "mile" ... Multipliers have no unit.
  unit         text,
  price        numeric(12, 2),
  markup_pct   numeric(6, 2),
  factor       numeric(6, 3),
  applies_to   text,
  active       boolean not null default true,
  is_example   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null,
  constraint price_items_name check (length(btrim(name)) > 0),
  constraint price_items_price_shape check (
    case kind
      when 'multiplier' then price is null
      else price is not null and price >= 0 and unit is not null and length(btrim(unit)) > 0
    end
  ),
  constraint price_items_markup_shape check (
    case kind
      when 'material' then markup_pct is null or (markup_pct >= 0 and markup_pct <= 1000)
      else markup_pct is null
    end
  ),
  constraint price_items_factor_shape check (
    case kind
      when 'multiplier' then factor is not null and factor > 0 and factor <= 10
        and applies_to is not null and applies_to in ('labor', 'materials', 'total')
      else factor is null and applies_to is null
    end
  )
);
comment on table public.price_items is 'Price book: labor rates, materials, adders and multipliers that estimates are built from. Retire (active = false) instead of deleting.';
comment on column public.price_items.price is 'labor: $ per hour; material: your cost per unit; adder: $ per unit. Null for multipliers.';
comment on column public.price_items.markup_pct is 'Materials only: default markup added on top of cost, in percent (25 = 25%).';
comment on column public.price_items.factor is 'Multipliers only: 1.15 means +15%.';
comment on column public.price_items.applies_to is 'Multipliers only: labor, materials or total.';

create unique index price_items_unique_active_name on public.price_items (kind, lower(btrim(name))) where active;
create index price_items_kind on public.price_items (kind, active);

create trigger price_items_updated_at before update on public.price_items
  for each row execute function public.set_updated_at();

-- ---------- Access ----------------------------------------------------

alter table public.price_items enable row level security;

create policy "Estimating roles read the price book" on public.price_items
  for select to authenticated using (public.has_role('admin', 'sales', 'operations', 'reviewer'));
create policy "Admins add price book items" on public.price_items
  for insert to authenticated with check (public.has_role('admin'));
create policy "Admins edit price book items" on public.price_items
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- No delete grant: items are retired so estimates keep their history.
grant select, insert, update on public.price_items to authenticated;
