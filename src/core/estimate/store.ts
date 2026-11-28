/**
 * Saved estimates (S3): the working draft of each estimate and its numbered versions.
 * The numbers are always worked out by `calculateEstimate`; the stored total is only
 * a copy for lists and the ticket's estimated value.
 */
import { NO_TAX, ROUND_TO_CENT, type EstimateInput, type RoundDirection } from "./math";
import type { AppliesTo } from "../pricebook/types";

/** What the builder edits and saves. */
export interface EstimateDraft {
  title: string;
  lines: EstimateInput;
  /** Shown to the customer: scope of work, what's included and what isn't. */
  notes: string;
  /** Office only. */
  internalNotes: string;
}

export interface Estimate extends EstimateDraft {
  id: string;
  ticketId: string;
  /** The draft's total as last saved. */
  total: number;
  /** Highest saved version number; 0 before the first version. */
  versionCount: number;
  isExample: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateVersion extends EstimateDraft {
  id: string;
  estimateId: string;
  /** 1, 2, 3... numbered by the database. */
  version: number;
  total: number;
  /** Optional one-liner about what changed. */
  label: string;
  createdBy: string | null;
  createdAt: string;
}

/** Where estimates live. The live app uses Supabase; preview mode and tests keep them in memory. */
export interface EstimatesBackend {
  /** Most recently changed first. */
  list(opts?: { ticketId?: string }): Promise<Estimate[]>;
  get(id: string): Promise<Estimate | null>;
  /** Resolves to the new estimate's id. */
  create(input: { ticketId: string; title: string }, actorId: string | null): Promise<string>;
  saveDraft(id: string, draft: EstimateDraft & { total: number }, actorId: string | null): Promise<void>;
  /** Newest first. */
  versions(estimateId: string): Promise<EstimateVersion[]>;
  /** Saves a snapshot and resolves to its version number. Also sets the ticket's estimated value. */
  saveVersion(estimateId: string, snapshot: EstimateDraft & { total: number; label: string }, actorId: string | null): Promise<number>;
}

export const EMPTY_LINES: EstimateInput = { labor: [], materials: [], adders: [], multipliers: [], tax: NO_TAX, rounding: ROUND_TO_CENT };

/** New line id that is unique enough to tell lines apart inside one estimate. */
export function newLineId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
/** Numbers stay numbers; blanks (saved as null) come back as NaN so the field shows empty and the issue stays listed. */
const n = (v: unknown, d = Number.NaN) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v === undefined ? d : Number.NaN);
const id = (v: unknown) => str(v) || newLineId();
const applies = (v: unknown): AppliesTo => (v === "labor" || v === "materials" || v === "total" ? v : "total");
const direction = (v: unknown): RoundDirection => (v === "up" || v === "down" ? v : "nearest");

/** Reads saved JSON back into estimate lines, filling anything missing with safe defaults. */
export function normalizeLines(raw: unknown): EstimateInput {
  const r = obj(raw);
  const tax = obj(r.tax);
  const taxable = obj(tax.taxable);
  const rounding = obj(r.rounding);
  return {
    labor: arr(r.labor).map((l) => ({ id: id(l.id), name: str(l.name), unit: str(l.unit, "hr"), quantity: n(l.quantity, 0), rate: n(l.rate, 0) })),
    materials: arr(r.materials).map((m) => ({
      id: id(m.id),
      name: str(m.name),
      unit: str(m.unit, "ea"),
      quantity: n(m.quantity, 0),
      unitCost: n(m.unitCost, 0),
      markupPct: n(m.markupPct, 0),
    })),
    adders: arr(r.adders).map((a) => ({ id: id(a.id), name: str(a.name), unit: str(a.unit, "job"), quantity: n(a.quantity, 1), price: n(a.price, 0) })),
    multipliers: arr(r.multipliers).map((m) => ({ id: id(m.id), name: str(m.name), factor: n(m.factor, 1), appliesTo: applies(m.appliesTo) })),
    tax: {
      ratePct: n(tax.ratePct, 0),
      taxable: { labor: taxable.labor === true, materials: taxable.materials === true, adders: taxable.adders === true },
    },
    rounding: { increment: n(rounding.increment, 0.01), direction: direction(rounding.direction) },
  };
}

/** Lines ready to save as JSON. Blank numbers become null (JSON has no NaN). */
export function linesForSaving(lines: EstimateInput): EstimateInput {
  return JSON.parse(JSON.stringify(lines)) as EstimateInput;
}

export function checkTitle(title: string): string | null {
  return title.trim() ? null : "Give the estimate a name, like “Deck rebuild”.";
}
