// @vitest-environment node
import { DEFAULT_COMPANY } from "../settings/types";
import { buildEstimateDocument, documentFileName, documentSumCents, type DocumentInput } from "./document";
import { calculateEstimate, toCents } from "./math";
import { estimatePdf, pdfSafe } from "./pdf";
import { normalizeLines } from "./store";

const lines = normalizeLines({
  labor: [
    { id: "l1", name: "Carpenter", unit: "hr", quantity: 32, rate: 75 },
    { id: "l2", name: "Helper", unit: "hr", quantity: 24.5, rate: 45 },
  ],
  materials: [
    { id: "m1", name: "Composite deck board 16 ft", unit: "ea", quantity: 48, unitCost: 52.37, markupPct: 22.5 },
    { id: "m2", name: "Joist hangers", unit: "ea", quantity: 0, unitCost: 3, markupPct: 20 },
  ],
  adders: [
    { id: "a1", name: "Building permit", unit: "job", quantity: 1, price: 150 },
    { id: "a2", name: "Dump trailer load", unit: "load", quantity: 2, price: 225 },
  ],
  multipliers: [
    { id: "x1", name: "Second-story height", factor: 1.2, appliesTo: "labor" },
    { id: "x2", name: "Rush", factor: 1.07, appliesTo: "total" },
    { id: "x3", name: "Repeat customer", factor: 0.95, appliesTo: "total" },
  ],
  tax: { ratePct: 6, taxable: { labor: false, materials: true, adders: false } },
  rounding: { increment: 5, direction: "up" },
});

const base: DocumentInput = {
  title: "Deck rebuild",
  lines,
  notes: "Tear out the old deck.\n\nBuild a new 12×16 ft composite deck.",
  version: 2,
  date: "2026-11-28T15:00:00.000Z",
  ticket: { number: 1001, customer: "Pat Example", site: "118 Fox Hall Dr, Dover", phone: "302-555-0101", email: "pat@example.com" },
  company: { ...DEFAULT_COMPANY, phone: "302-555-0100", city: "Dover", zip: "19901", licenseNumber: "2026-123456", estimateValidDays: 30 },
  detail: "itemized",
};

describe("customer estimate document", () => {
  it("adds up exactly to the builder's total, itemized and in summary", () => {
    const result = calculateEstimate(lines);
    for (const detail of ["itemized", "summary"] as const) {
      const doc = buildEstimateDocument({ ...base, detail });
      expect(doc.total).toBe(result.total);
      expect(documentSumCents(doc)).toBe(toCents(result.total));
    }
  });

  it("lists every line with its quantity in the itemized view, and never your cost or markup", () => {
    const doc = buildEstimateDocument(base);
    expect(doc.sections.map((s) => s.title)).toEqual(["Labor", "Materials", "Additional items"]);
    const labor = doc.sections[0];
    expect(labor.rows.map((r) => [r.label, r.detail, r.kind])).toEqual([
      ["Carpenter", "32 hr", "item"],
      ["Helper", "24.5 hr", "item"],
      ["Second-story height", "", "adjust"],
    ]);
    expect(labor.total).toBe(calculateEstimate(lines).laborTotal);
    // The permit is a flat fee, so no "1 job".
    expect(doc.sections[2].rows[0]).toMatchObject({ label: "Building permit", detail: "", amount: 150 });
    expect(doc.sections[2].rows[1]).toMatchObject({ detail: "2 load", amount: 450 });
    expect(JSON.stringify(doc)).not.toMatch(/52\.37|22\.5|markup|cost/i);
    expect(doc.totals.map((t) => t.label)).toEqual(["Subtotal", "Rush", "Repeat customer", "Sales tax (6%)", "Rounding"]);
  });

  it("shows one row per part in the summary", () => {
    const doc = buildEstimateDocument({ ...base, detail: "summary" });
    expect(doc.sections).toEqual([]);
    expect(doc.totals.map((t) => [t.label, t.kind])).toEqual([
      ["Labor", "part"],
      ["Materials", "part"],
      ["Additional items", "part"],
      ["Rush", "adjust"],
      ["Repeat customer", "adjust"],
      ["Sales tax (6%)", "tax"],
      ["Rounding", "adjust"],
    ]);
  });

  it("keeps a simple estimate simple", () => {
    const simple = normalizeLines({ labor: [{ id: "l", name: "Handyman", unit: "hr", quantity: 3, rate: 80 }] });
    const doc = buildEstimateDocument({ ...base, lines: simple });
    expect(doc.sections.map((s) => s.title)).toEqual(["Labor"]);
    expect(doc.totals).toEqual([]);
    expect(doc.total).toBe(240);
  });

  it("fills in who it's from and for, the number, dates, scope and terms", () => {
    const doc = buildEstimateDocument(base);
    expect(doc.number).toBe("1001-2");
    expect(doc.isDraft).toBe(false);
    expect(doc.validUntil.slice(0, 10)).toBe("2026-12-28");
    expect(doc.customer).toEqual({ name: "Pat Example", lines: ["118 Fox Hall Dr, Dover", "302-555-0101", "pat@example.com"] });
    expect(doc.company.lines).toEqual(["Dover, DE 19901", "302-555-0100"]);
    expect(doc.scope).toEqual(["Tear out the old deck.", "Build a new 12×16 ft composite deck."]);
    expect(doc.terms.length).toBeGreaterThan(1);
    expect(documentFileName(doc)).toBe("Deck rebuild - Estimate 1001-2.pdf");
  });

  it("marks a draft preview and leaves the number blank", () => {
    const doc = buildEstimateDocument({ ...base, version: null });
    expect(doc.isDraft).toBe(true);
    expect(doc.number).toBe("");
    expect(documentFileName(doc)).toBe("Deck rebuild - Estimate draft.pdf");
  });

  it("counts numbers left out of the total", () => {
    const bad = normalizeLines({ labor: [{ id: "l", name: "Carpenter", unit: "hr", quantity: null, rate: 75 }] });
    expect(buildEstimateDocument({ ...base, lines: bad }).issueCount).toBe(1);
  });
});

describe("estimate PDF", () => {
  it("only uses characters the PDF fonts can draw", () => {
    expect(pdfSafe("“Option B” — 12×16 ft − 10% … ✓")).toBe('"Option B" - 12×16 ft - 10% ... ');
  });

  it("makes a real PDF with the customer, the scope, every line and the same total", async () => {
    const doc = buildEstimateDocument(base);
    const blob = await estimatePdf(doc);
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(text.startsWith("%PDF-")).toBe(true);
    const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(doc.total);
    for (const s of ["ESTIMATE", "No. 1001-2", "Pat Example", "Tear out the old deck.", "Carpenter", "Building permit", "Sales tax (6%)", total]) {
      expect(text).toContain(`(${s.replace(/[()]/g, "\\$&")}) Tj`);
    }
  });

  it("runs onto more pages for a long estimate and numbers them", async () => {
    const many = normalizeLines({ materials: Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, name: `Item ${i + 1}`, unit: "ea", quantity: 1, unitCost: 10, markupPct: 0 })) });
    const blob = await estimatePdf(buildEstimateDocument({ ...base, lines: many }));
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(text).toMatch(/\(Page 1 of [23]\)/);
    expect(text).toContain("(Item 80)");
  });
});
