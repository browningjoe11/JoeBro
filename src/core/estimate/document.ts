/**
 * Customer estimate document (S4).
 *
 * Turns a saved estimate version (or the draft, for a preview) into what the customer
 * sees: who it's from and for, the scope notes, the priced lines and the terms. The web
 * page and the PDF both draw from this one model, and every number in it comes from
 * `calculateEstimate`, so the document always matches the builder to the cent.
 */
import type { CompanySettings } from "../settings/types";
import { calculateEstimate, toCents, type EstimateInput, type EstimateResult } from "./math";

/** "summary": one row per part (labor, materials, additional items). "itemized": every line. */
export type DetailLevel = "summary" | "itemized";

export interface DocRow {
  label: string;
  /** "32 hr", "48 ea"; empty when there's nothing useful to say. */
  detail: string;
  /** Dollars. 0 shows as "Included". */
  amount: number;
  /** "adjust" rows (multipliers, rounding) show a + or − sign. */
  kind: "item" | "adjust";
}

export interface DocSection {
  title: string;
  rows: DocRow[];
  /** What the section adds to the price; always the sum of its rows. */
  total: number;
}

export interface DocTotalRow {
  label: string;
  amount: number;
  /** "part": a summary row (labor, materials...). "subtotal" restates the itemized sections above it. */
  kind: "part" | "subtotal" | "adjust" | "tax";
}

export interface DocParty {
  name: string;
  /** Address and contact lines, blanks left out. */
  lines: string[];
}

export interface EstimateDocument {
  title: string;
  /** "1001-2" (ticket number and version), or "" for a draft. */
  number: string;
  /** Null while previewing the draft. */
  version: number | null;
  isDraft: boolean;
  /** ISO date the version was saved (or now, for a draft). */
  date: string;
  /** ISO date the price holds until. */
  validUntil: string;
  company: DocParty & { licenseNumber: string };
  customer: DocParty;
  /** Paragraphs of the customer scope notes. */
  scope: string[];
  detail: DetailLevel;
  /** Itemized only; empty in summary. */
  sections: DocSection[];
  /** Summary rows, subtotal, adjustments and tax, in order; they add up to the total. */
  totals: DocTotalRow[];
  total: number;
  /** Paragraphs of the company's estimate terms. */
  terms: string[];
  /** Numbers left out because they were blank or made no sense (see EstimateResult.issues). */
  issueCount: number;
}

export interface DocumentInput {
  title: string;
  lines: EstimateInput;
  /** Customer-facing scope notes. Internal notes never go on the document. */
  notes: string;
  /** Null for a draft preview. */
  version: number | null;
  /** When the version was saved; for a draft, the moment of the preview. */
  date: string;
  ticket: { number: number; customer: string; site: string; phone?: string; email?: string } | null;
  company: CompanySettings;
  detail: DetailLevel;
}

const paragraphs = (text: string) =>
  text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

const qty = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "");
/** "32 hr"; nothing for a single flat job charge. */
function detailOf(quantity: number, unit: string): string {
  const u = unit.trim();
  if (u === "job" && quantity === 1) return "";
  const q = qty(quantity);
  return q ? `${q}${u ? ` ${u}` : ""}` : "";
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + (Number.isFinite(days) ? days : 30));
  return d.toISOString();
}

/** The company's address and contact lines as printed in the letterhead. */
export function companyLines(c: CompanySettings): string[] {
  // A state on its own (the "DE" default) says nothing, so it only prints with a city or ZIP.
  const cityLine = c.city.trim() || c.zip.trim() ? [c.city.trim(), [c.state.trim(), c.zip.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  return [c.street.trim(), cityLine, c.phone.trim(), c.email.trim(), c.website.trim()].filter(Boolean);
}

export function buildEstimateDocument(input: DocumentInput, result: EstimateResult = calculateEstimate(input.lines)): EstimateDocument {
  const { lines, company, ticket } = input;
  const byId = new Map<string, number>();
  for (const r of [...result.labor, ...result.materials, ...result.adders, ...result.multipliers]) byId.set(r.id, r.amount);
  const amountOf = (id: string) => byId.get(id) ?? 0;
  const multiplierRows = (target: "labor" | "materials" | "total"): DocRow[] =>
    lines.multipliers
      .filter((m) => m.appliesTo === target && amountOf(m.id) !== 0)
      .map((m) => ({ label: m.name.trim() || "Adjustment", detail: "", amount: amountOf(m.id), kind: "adjust" as const }));

  const sections: DocSection[] = [];
  const totals: DocTotalRow[] = [];

  if (input.detail === "itemized") {
    const labor: DocRow[] = [
      ...lines.labor.map((l) => ({ label: l.name.trim() || "Labor", detail: detailOf(l.quantity, l.unit), amount: amountOf(l.id), kind: "item" as const })),
      ...multiplierRows("labor"),
    ];
    const materials: DocRow[] = [
      ...lines.materials.map((m) => ({ label: m.name.trim() || "Material", detail: detailOf(m.quantity, m.unit), amount: amountOf(m.id), kind: "item" as const })),
      ...multiplierRows("materials"),
    ];
    const adders: DocRow[] = lines.adders.map((a) => ({ label: a.name.trim() || "Item", detail: detailOf(a.quantity, a.unit), amount: amountOf(a.id), kind: "item" as const }));
    if (labor.length) sections.push({ title: "Labor", rows: labor, total: result.laborTotal });
    if (materials.length) sections.push({ title: "Materials", rows: materials, total: result.materialsTotal });
    if (adders.length) sections.push({ title: "Additional items", rows: adders, total: result.addersTotal });
  } else {
    if (lines.labor.length || result.laborTotal !== 0) totals.push({ label: "Labor", amount: result.laborTotal, kind: "part" });
    if (lines.materials.length || result.materialsTotal !== 0) totals.push({ label: "Materials", amount: result.materialsTotal, kind: "part" });
    if (lines.adders.length || result.addersTotal !== 0) totals.push({ label: "Additional items", amount: result.addersTotal, kind: "part" });
  }

  const wholeRows = multiplierRows("total");
  const hasTax = result.tax !== 0 || result.taxRatePct > 0;
  // A subtotal line only helps when something follows it; in summary, the part rows already are the breakdown.
  if (input.detail === "itemized" && sections.length > 1 && (wholeRows.length || hasTax || result.roundingAdjustment !== 0)) {
    totals.push({ label: "Subtotal", amount: result.subtotal, kind: "subtotal" });
  }
  for (const r of wholeRows) totals.push({ label: r.label, amount: r.amount, kind: "adjust" });
  if (hasTax) totals.push({ label: `Sales tax (${result.taxRatePct}%)`, amount: result.tax, kind: "tax" });
  if (result.roundingAdjustment !== 0) totals.push({ label: "Rounding", amount: result.roundingAdjustment, kind: "adjust" });

  const customerLines = ticket ? [ticket.site, ticket.phone ?? "", ticket.email ?? ""].map((s) => s.trim()).filter(Boolean) : [];
  return {
    title: input.title.trim() || "Estimate",
    number: ticket && input.version !== null ? `${ticket.number}-${input.version}` : "",
    version: input.version,
    isDraft: input.version === null,
    date: input.date,
    validUntil: addDays(input.date, company.estimateValidDays),
    company: { name: company.name.trim(), lines: companyLines(company), licenseNumber: company.licenseNumber.trim() },
    customer: { name: ticket?.customer.trim() || "Customer", lines: customerLines },
    scope: paragraphs(input.notes),
    detail: input.detail,
    sections,
    totals,
    total: result.total,
    terms: paragraphs(company.estimateTerms),
    issueCount: result.issues.length,
  };
}

/** Sum of everything printed above the total, in cents; equals the total for every document. */
export function documentSumCents(doc: EstimateDocument): number {
  const rows = doc.sections.reduce((s, sec) => s + sec.rows.reduce((t, r) => t + toCents(r.amount), 0), 0);
  // The subtotal line restates the sections above it, so it isn't added twice.
  const totals = doc.totals.filter((t) => t.kind !== "subtotal").reduce((s, t) => s + toCents(t.amount), 0);
  return rows + totals;
}

/** "Deck rebuild - Estimate 1001-2.pdf" with characters file systems dislike taken out. */
export function documentFileName(doc: EstimateDocument): string {
  const base = `${doc.title} - Estimate ${doc.number || "draft"}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${base}.pdf`;
}
