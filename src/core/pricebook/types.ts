/** What a price book item is. Mirrors the price_kind enum in the database. */
export type PriceKind = "labor" | "material" | "adder" | "multiplier";
/** What a multiplier scales on an estimate. */
export type AppliesTo = "labor" | "materials" | "total";

export const PRICE_KINDS: readonly PriceKind[] = ["labor", "material", "adder", "multiplier"];

export const KIND_LABELS: Record<PriceKind, { title: string; singular: string; info: string; priceLabel: string; units: string[] }> = {
  labor: {
    title: "Labor rates",
    singular: "labor rate",
    info: "What you charge per hour for each kind of worker. An estimate multiplies hours by the rate.",
    priceLabel: "Rate",
    units: ["hr", "day"],
  },
  material: {
    title: "Materials",
    singular: "material",
    info: "Things you buy for a job, at your cost per unit. The markup is added on top when the material goes on an estimate, and can be changed there.",
    priceLabel: "Your cost",
    units: ["ea", "sq ft", "lin ft", "sheet", "bundle", "box", "gal", "bag", "yd³"],
  },
  adder: {
    title: "Adders",
    singular: "adder",
    info: "Extra charges like permits, disposal and travel. Use the unit \"job\" for a flat fee, or a unit like load or mile to charge per quantity.",
    priceLabel: "Charge",
    units: ["job", "load", "mile", "trip", "day"],
  },
  multiplier: {
    title: "Multipliers",
    singular: "multiplier",
    info: "Adjustments for harder jobs, like difficult access, working at height or a rush. 1.15 adds 15% to the part of the estimate it applies to.",
    priceLabel: "Factor",
    units: [],
  },
};

export const APPLIES_LABELS: Record<AppliesTo, string> = {
  labor: "Labor",
  materials: "Materials",
  total: "Whole estimate",
};

export interface PriceItem {
  id: string;
  kind: PriceKind;
  name: string;
  description: string;
  /** Limits the item to one trade when picking; "" means any trade. */
  trade: string;
  /** "hr", "sq ft", "job" ... Empty for multipliers. */
  unit: string;
  /** labor: $ per hour; material: your cost per unit; adder: $ per unit. Null for multipliers. */
  price: number | null;
  /** Materials only: default markup in percent (25 = 25%). */
  markupPct: number | null;
  /** Multipliers only: 1.15 = +15%. */
  factor: number | null;
  appliesTo: AppliesTo | null;
  /** False once retired: kept for old estimates, hidden from the picker. */
  active: boolean;
  isExample: boolean;
}

export type PriceItemInput = Omit<PriceItem, "id" | "active" | "isExample">;
export type PriceItemPatch = Partial<PriceItemInput & { active: boolean }>;

/** Where the price book lives. The live app uses Supabase; preview mode and tests keep it in memory. */
export interface PriceBookBackend {
  list(): Promise<PriceItem[]>;
  /** Resolves to the new item's id. */
  create(item: PriceItemInput, actorId: string | null): Promise<string>;
  /** Kind can't change after an item is created. */
  update(id: string, patch: PriceItemPatch, actorId: string | null): Promise<void>;
}

/** Clears the numbers that don't belong to the item's kind and trims text. */
export function normalizeItem(i: PriceItemInput): PriceItemInput {
  const isMult = i.kind === "multiplier";
  return {
    kind: i.kind,
    name: i.name.trim(),
    description: i.description.trim(),
    trade: i.trade.trim(),
    unit: isMult ? "" : i.unit.trim(),
    price: isMult ? null : i.price,
    markupPct: i.kind === "material" ? i.markupPct : null,
    factor: isMult ? i.factor : null,
    appliesTo: isMult ? i.appliesTo : null,
  };
}

/** Same rules as the checks on the price_items table. Returns field → message for anything wrong. */
export function checkItem(i: PriceItemInput): Partial<Record<keyof PriceItemInput, string>> {
  const errors: Partial<Record<keyof PriceItemInput, string>> = {};
  if (!i.name.trim()) errors.name = "Give the item a name.";
  if (i.kind === "multiplier") {
    if (i.factor === null || !Number.isFinite(i.factor) || i.factor <= 0 || i.factor > 10) errors.factor = "Enter a factor between 0.01 and 10, like 1.15.";
    if (!i.appliesTo) errors.appliesTo = "Pick what it applies to.";
  } else {
    if (i.price === null || !Number.isFinite(i.price) || i.price < 0) errors.price = "Enter an amount of $0 or more.";
    if (!i.unit.trim()) errors.unit = "Enter a unit, like hr or ea.";
  }
  if (i.kind === "material" && i.markupPct !== null && (!Number.isFinite(i.markupPct) || i.markupPct < 0 || i.markupPct > 1000))
    errors.markupPct = "Markup should be between 0% and 1000%.";
  return errors;
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$75.00 / hr", "$52.00 / ea + 20%", "×1.15 on labor (+15%)". */
export function describePrice(i: Pick<PriceItem, "kind" | "price" | "unit" | "markupPct" | "factor" | "appliesTo">): string {
  if (i.kind === "multiplier") {
    if (i.factor === null) return "";
    const pct = Math.round((i.factor - 1) * 1000) / 10;
    const on = i.appliesTo === "total" ? "whole estimate" : i.appliesTo ?? "";
    return `×${i.factor} on ${on} (${pct >= 0 ? "+" : ""}${pct}%)`;
  }
  if (i.price === null) return "";
  const base = `${money.format(i.price)} / ${i.unit}`;
  return i.kind === "material" && i.markupPct ? `${base} + ${i.markupPct}% markup` : base;
}

export function formatMoney(n: number | null): string {
  return n === null ? "" : money.format(n);
}

/** Active items that fit a search, a kind and a trade, in book order. Used by the picker. */
export function findItems(items: PriceItem[], opts: { query?: string; kind?: PriceKind; trade?: string; includeRetired?: boolean } = {}): PriceItem[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  return sortItems(
    items.filter((i) => {
      if (!opts.includeRetired && !i.active) return false;
      if (opts.kind && i.kind !== opts.kind) return false;
      if (opts.trade && i.trade && i.trade !== opts.trade) return false;
      if (!q) return true;
      return [i.name, i.description, i.trade, i.unit].some((v) => v.toLowerCase().includes(q));
    }),
  );
}

export function sortItems(items: PriceItem[]): PriceItem[] {
  return items
    .slice()
    .sort((a, b) => PRICE_KINDS.indexOf(a.kind) - PRICE_KINDS.indexOf(b.kind) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}
