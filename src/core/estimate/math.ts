/**
 * Estimate math engine (S2).
 *
 * Pure functions, no React and no database: the estimate builder (S3), the customer
 * document (S4) and invoices all call `calculateEstimate` so they always agree.
 *
 * All money is worked in whole cents internally so totals never drift by a penny,
 * and every part of the breakdown adds up exactly to the total.
 *
 * Order of work:
 *   1. Labor lines: quantity × rate (hours or days).
 *   2. Material lines: quantity × your cost, plus markup.
 *   3. Adders: quantity × charge (a flat fee is quantity 1).
 *   4. Multipliers on labor, on materials, then on the whole estimate.
 *   5. Tax on the parts marked taxable.
 *   6. Rounding of the final total (to the cent by default, or to the dollar, $5, $10...).
 */
import type { AppliesTo, PriceItem } from "../pricebook/types";

export interface LaborLine {
  id: string;
  name: string;
  /** "hr" or "day": the rate is per this unit. */
  unit: string;
  /** Hours or days. */
  quantity: number;
  /** $ per unit. */
  rate: number;
}

export interface MaterialLine {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  /** Your cost per unit, in dollars. */
  unitCost: number;
  /** Percent added on top of cost (25 = 25%). */
  markupPct: number;
}

export interface AdderLine {
  id: string;
  name: string;
  /** "job" for a flat fee, or load, mile, trip... */
  unit: string;
  quantity: number;
  /** $ per unit. */
  price: number;
}

export interface MultiplierLine {
  id: string;
  name: string;
  /** 1.15 adds 15%; 0.9 takes off 10%. */
  factor: number;
  appliesTo: AppliesTo;
}

export interface TaxSettings {
  /** Percent, 6 = 6%. 0 means no tax line. */
  ratePct: number;
  /** Which parts of the estimate are taxed. */
  taxable: { labor: boolean; materials: boolean; adders: boolean };
}

export type RoundDirection = "nearest" | "up" | "down";

export interface RoundingSettings {
  /** Round the final total to this many dollars: 0.01 (cents), 1, 5, 10, 25, 50, 100... */
  increment: number;
  direction: RoundDirection;
}

export interface EstimateInput {
  labor: LaborLine[];
  materials: MaterialLine[];
  adders: AdderLine[];
  multipliers: MultiplierLine[];
  tax?: TaxSettings;
  rounding?: RoundingSettings;
}

export const NO_TAX: TaxSettings = { ratePct: 0, taxable: { labor: false, materials: false, adders: false } };
export const ROUND_TO_CENT: RoundingSettings = { increment: 0.01, direction: "nearest" };

export interface LineResult {
  id: string;
  /** What the customer pays for this line, before multipliers. */
  amount: number;
}

export interface MaterialLineResult extends LineResult {
  /** Your cost for the line. */
  cost: number;
  /** amount − cost. */
  markup: number;
}

export interface MultiplierResult {
  id: string;
  appliesTo: AppliesTo;
  /** Dollars this multiplier adds (negative if it takes off). */
  amount: number;
}

export type IssueField = "quantity" | "rate" | "unitCost" | "markupPct" | "price" | "factor" | "appliesTo" | "ratePct" | "increment";

export interface Issue {
  /** Line id, or "tax" / "rounding". */
  id: string;
  field: IssueField;
  message: string;
}

export interface EstimateResult {
  labor: LineResult[];
  materials: MaterialLineResult[];
  adders: LineResult[];
  multipliers: MultiplierResult[];

  laborSubtotal: number;
  /** Labor after labor multipliers. */
  laborTotal: number;
  materialsCost: number;
  materialsMarkup: number;
  /** Materials with markup, before material multipliers. */
  materialsSubtotal: number;
  /** Materials after material multipliers. */
  materialsTotal: number;
  addersTotal: number;
  /** laborTotal + materialsTotal + addersTotal. */
  subtotal: number;
  /** What the whole-estimate multipliers add. */
  totalAdjustment: number;
  /** subtotal + totalAdjustment: the price before tax. */
  preTax: number;

  taxRatePct: number;
  /** The part of preTax that is taxed. */
  taxableAmount: number;
  tax: number;

  /** What rounding added (negative if it took off). */
  roundingAdjustment: number;
  /** The price the customer pays. */
  total: number;

  /** Numbers that were ignored because they made no sense. Empty when all is well. */
  issues: Issue[];
}

// ---------- money helpers ----------

/** Dollars (any precision) to whole cents, half away from zero, without float surprises like 1.005. */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  const c = Number((dollars * 100).toPrecision(12));
  const r = Math.sign(c) * Math.round(Math.abs(c));
  return r === 0 ? 0 : r; // no -0
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Round whole cents to an increment of cents in a direction. */
export function roundCents(cents: number, incrementCents: number, direction: RoundDirection): number {
  if (incrementCents <= 1) return cents;
  const q = cents / incrementCents;
  let n: number;
  if (direction === "up") n = Math.ceil(q - 1e-9);
  else if (direction === "down") n = Math.floor(q + 1e-9);
  else n = Math.sign(q) * Math.round(Math.abs(q));
  const r = n * incrementCents;
  return r === 0 ? 0 : r;
}

// ---------- validation ----------

function num(v: number, id: string, field: IssueField, issues: Issue[], opts: { min?: number; max?: number; minExclusive?: boolean; message: string }): number | null {
  const bad =
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    (opts.min !== undefined && (opts.minExclusive ? v <= opts.min : v < opts.min)) ||
    (opts.max !== undefined && v > opts.max);
  if (bad) {
    issues.push({ id, field, message: opts.message });
    return null;
  }
  return v;
}

const QTY_MSG = "Enter a quantity of 0 or more.";
const MONEY_MSG = "Enter an amount of $0 or more.";

// ---------- the engine ----------

export function calculateEstimate(input: EstimateInput): EstimateResult {
  const issues: Issue[] = [];
  const tax = input.tax ?? NO_TAX;
  const rounding = input.rounding ?? ROUND_TO_CENT;

  // 1. Labor
  const labor: LineResult[] = input.labor.map((l) => {
    const q = num(l.quantity, l.id, "quantity", issues, { min: 0, message: QTY_MSG });
    const r = num(l.rate, l.id, "rate", issues, { min: 0, message: MONEY_MSG });
    return { id: l.id, amount: q === null || r === null ? 0 : toCents(q * r) };
  });

  // 2. Materials
  const materials = input.materials.map((m) => {
    const q = num(m.quantity, m.id, "quantity", issues, { min: 0, message: QTY_MSG });
    const c = num(m.unitCost, m.id, "unitCost", issues, { min: 0, message: MONEY_MSG });
    const pct = num(m.markupPct, m.id, "markupPct", issues, { min: 0, max: 1000, message: "Markup should be between 0% and 1000%." }) ?? 0;
    if (q === null || c === null) return { id: m.id, cost: 0, markup: 0, amount: 0 };
    const cost = toCents(q * c);
    const amount = toCents(q * c * (1 + pct / 100));
    return { id: m.id, cost, markup: amount - cost, amount };
  });

  // 3. Adders
  const adders: LineResult[] = input.adders.map((a) => {
    const q = num(a.quantity, a.id, "quantity", issues, { min: 0, message: QTY_MSG });
    const p = num(a.price, a.id, "price", issues, { min: 0, message: MONEY_MSG });
    return { id: a.id, amount: q === null || p === null ? 0 : toCents(q * p) };
  });

  // 4. Multipliers, grouped by what they apply to, in the order given.
  const valid: MultiplierLine[] = input.multipliers.filter((m) => {
    const okTarget = m.appliesTo === "labor" || m.appliesTo === "materials" || m.appliesTo === "total";
    if (!okTarget) issues.push({ id: m.id, field: "appliesTo", message: "Pick what it applies to." });
    const f = num(m.factor, m.id, "factor", issues, { min: 0, minExclusive: true, max: 10, message: "Enter a factor between 0.01 and 10, like 1.15." });
    return okTarget && f !== null;
  });
  const multiplierAmounts = new Map<string, number>();
  /** Applies factors one after another; each one's amount is the rounded step, so the steps add up exactly. */
  const applyChain = (baseCents: number, target: AppliesTo): number => {
    let factor = 1;
    let prev = baseCents;
    for (const m of valid) {
      if (m.appliesTo !== target) continue;
      factor *= m.factor;
      const next = toCents(fromCents(baseCents) * factor);
      multiplierAmounts.set(m.id, next - prev);
      prev = next;
    }
    return prev;
  };

  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  const laborSubtotal = sum(labor);
  const laborTotal = applyChain(laborSubtotal, "labor");
  const materialsCost = materials.reduce((s, m) => s + m.cost, 0);
  const materialsSubtotal = sum(materials);
  const materialsMarkup = materialsSubtotal - materialsCost;
  const materialsTotal = applyChain(materialsSubtotal, "materials");
  const addersTotal = sum(adders);
  const subtotal = laborTotal + materialsTotal + addersTotal;
  const preTax = applyChain(subtotal, "total");
  const totalAdjustment = preTax - subtotal;

  // 5. Tax. Whole-estimate multipliers scale the taxed part in proportion.
  const ratePct = num(tax.ratePct, "tax", "ratePct", issues, { min: 0, max: 100, message: "Tax rate should be between 0% and 100%." }) ?? 0;
  const taxedBefore = (tax.taxable.labor ? laborTotal : 0) + (tax.taxable.materials ? materialsTotal : 0) + (tax.taxable.adders ? addersTotal : 0);
  const taxableAmount = ratePct === 0 ? 0 : subtotal === 0 ? 0 : taxedBefore === subtotal ? preTax : toCents(fromCents(taxedBefore) * (preTax / subtotal));
  const taxCents = toCents(fromCents(taxableAmount) * (ratePct / 100));

  // 6. Rounding
  const inc = num(rounding.increment, "rounding", "increment", issues, { min: 0, minExclusive: true, max: 10000, message: "Round to an amount like $0.01, $1, $5 or $10." });
  const incCents = inc === null ? 1 : Math.max(1, toCents(inc));
  const raw = preTax + taxCents;
  const total = roundCents(raw, incCents, rounding.direction);

  const d = fromCents;
  return {
    labor: labor.map((l) => ({ id: l.id, amount: d(l.amount) })),
    materials: materials.map((m) => ({ id: m.id, cost: d(m.cost), markup: d(m.markup), amount: d(m.amount) })),
    adders: adders.map((a) => ({ id: a.id, amount: d(a.amount) })),
    multipliers: input.multipliers.map((m) => ({ id: m.id, appliesTo: m.appliesTo, amount: d(multiplierAmounts.get(m.id) ?? 0) })),
    laborSubtotal: d(laborSubtotal),
    laborTotal: d(laborTotal),
    materialsCost: d(materialsCost),
    materialsMarkup: d(materialsMarkup),
    materialsSubtotal: d(materialsSubtotal),
    materialsTotal: d(materialsTotal),
    addersTotal: d(addersTotal),
    subtotal: d(subtotal),
    totalAdjustment: d(totalAdjustment),
    preTax: d(preTax),
    taxRatePct: ratePct,
    taxableAmount: d(taxableAmount),
    tax: d(taxCents),
    roundingAdjustment: d(total - raw),
    total: d(total),
    issues,
  };
}

// ---------- from the price book ----------

export type EstimateLine =
  | { section: "labor"; line: LaborLine }
  | { section: "materials"; line: MaterialLine }
  | { section: "adders"; line: AdderLine }
  | { section: "multipliers"; line: MultiplierLine };

/**
 * Copies a price book item onto a new estimate line (name, unit and numbers), so later
 * price book changes never change an estimate already written.
 */
export function lineFromItem(item: Pick<PriceItem, "kind" | "name" | "unit" | "price" | "markupPct" | "factor" | "appliesTo">, id: string, quantity = 1): EstimateLine {
  switch (item.kind) {
    case "labor":
      return { section: "labor", line: { id, name: item.name, unit: item.unit, quantity, rate: item.price ?? 0 } };
    case "material":
      return { section: "materials", line: { id, name: item.name, unit: item.unit, quantity, unitCost: item.price ?? 0, markupPct: item.markupPct ?? 0 } };
    case "adder":
      return { section: "adders", line: { id, name: item.name, unit: item.unit, quantity, price: item.price ?? 0 } };
    case "multiplier":
      return { section: "multipliers", line: { id, name: item.name, factor: item.factor ?? 1, appliesTo: item.appliesTo ?? "total" } };
  }
}

export const EMPTY_ESTIMATE: EstimateInput = { labor: [], materials: [], adders: [], multipliers: [], tax: NO_TAX, rounding: ROUND_TO_CENT };
