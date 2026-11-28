import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeItem, type AppliesTo, type PriceBookBackend, type PriceItem, type PriceItemInput, type PriceKind } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const orNull = (v: string) => (v.trim() ? v.trim() : null);

/** Turns database errors into wording people can act on. */
function fail(error: { message: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/price_items_unique_active_name/.test(m)) throw new Error("There's already an active item with that name.");
  if (/price_items_name/.test(m)) throw new Error("Give the item a name.");
  if (/price_items_price_shape/.test(m)) throw new Error("Enter an amount of $0 or more and a unit.");
  if (/price_items_markup_shape/.test(m)) throw new Error("Markup should be between 0% and 1000%.");
  if (/price_items_factor_shape/.test(m)) throw new Error("Enter a factor between 0.01 and 10 and what it applies to.");
  if (/row-level security|permission denied/i.test(m)) throw new Error("Only admins can change the price book.");
  throw new Error(m);
}

const COLUMNS = "id, kind, name, description, trade, unit, price, markup_pct, factor, applies_to, active, is_example";

function toItem(r: Row): PriceItem {
  return {
    id: s(r.id),
    kind: r.kind as PriceKind,
    name: s(r.name),
    description: s(r.description),
    trade: s(r.trade),
    unit: s(r.unit),
    price: num(r.price),
    markupPct: num(r.markup_pct),
    factor: num(r.factor),
    appliesTo: (r.applies_to as AppliesTo) ?? null,
    active: !!r.active,
    isExample: !!r.is_example,
  };
}

function toRow(i: PriceItemInput): Row {
  const n = normalizeItem(i);
  return {
    name: n.name,
    description: orNull(n.description),
    trade: orNull(n.trade),
    unit: orNull(n.unit),
    price: n.price,
    markup_pct: n.markupPct,
    factor: n.factor,
    applies_to: n.appliesTo,
  };
}

export function supabasePriceBook(sb: SupabaseClient): PriceBookBackend {
  return {
    async list() {
      const { data, error } = await sb.from("price_items").select(COLUMNS).order("name").limit(2000);
      fail(error);
      return ((data ?? []) as Row[]).map(toItem);
    },

    async create(item, actorId) {
      const { data, error } = await sb
        .from("price_items")
        .insert({ ...toRow(item), kind: item.kind, updated_by: actorId })
        .select("id")
        .single();
      fail(error);
      return s((data as Row).id);
    },

    async update(id, patch, actorId) {
      // Read the current row so the kind rules are applied to the whole item, not just the changed fields.
      const { data: cur, error: readError } = await sb.from("price_items").select(COLUMNS).eq("id", id).maybeSingle();
      fail(readError);
      if (!cur) throw new Error("That item no longer exists.");
      const current = toItem(cur as Row);
      const { active, ...rest } = patch;
      const row: Row = { ...toRow({ ...current, ...rest, kind: current.kind }), updated_by: actorId };
      if (active !== undefined) row.active = active;
      const { data, error } = await sb.from("price_items").update(row).eq("id", id).select("id");
      fail(error);
      if (!data || data.length === 0) throw new Error("Only admins can change the price book.");
    },
  };
}
