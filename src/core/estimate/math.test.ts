import type { PriceItem } from "../pricebook/types";
import {
  calculateEstimate,
  EMPTY_ESTIMATE,
  lineFromItem,
  roundCents,
  toCents,
  type AdderLine,
  type EstimateInput,
  type LaborLine,
  type MaterialLine,
  type MultiplierLine,
} from "./math";

const labor = (id: string, quantity: number, rate: number): LaborLine => ({ id, name: id, unit: "hr", quantity, rate });
const mat = (id: string, quantity: number, unitCost: number, markupPct = 0): MaterialLine => ({ id, name: id, unit: "ea", quantity, unitCost, markupPct });
const adder = (id: string, quantity: number, price: number): AdderLine => ({ id, name: id, unit: "job", quantity, price });
const mult = (id: string, factor: number, appliesTo: MultiplierLine["appliesTo"]): MultiplierLine => ({ id, name: id, factor, appliesTo });
const est = (p: Partial<EstimateInput>): EstimateInput => ({ ...EMPTY_ESTIMATE, ...p });

/** A typical deck job used by several tests. */
const deck = (): EstimateInput =>
  est({
    labor: [labor("carpenter", 16, 75), labor("helper", 16, 45)],
    materials: [mat("boards", 40, 12.48, 25), mat("screws", 3, 38.97, 20)],
    adders: [adder("permit", 1, 150), adder("disposal", 2, 85)],
    multipliers: [mult("height", 1.1, "labor"), mult("rush", 1.05, "total")],
    tax: { ratePct: 6, taxable: { labor: false, materials: true, adders: false } },
  });

describe("money helpers", () => {
  it("rounds dollars to cents half away from zero, without float surprises", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(1.004)).toBe(100);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(0)).toBe(0);
    expect(Object.is(toCents(-0.001), 0)).toBe(true);
    expect(toCents(NaN)).toBe(0);
    expect(toCents(Infinity)).toBe(0);
  });

  it("rounds cents to an increment in each direction", () => {
    expect(roundCents(340425, 1000, "nearest")).toBe(340000);
    expect(roundCents(340500, 1000, "nearest")).toBe(341000);
    expect(roundCents(340425, 1000, "up")).toBe(341000);
    expect(roundCents(340000, 1000, "up")).toBe(340000);
    expect(roundCents(340999, 1000, "down")).toBe(340000);
    expect(roundCents(250, 500, "nearest")).toBe(500);
    expect(roundCents(12345, 1, "up")).toBe(12345);
  });
});

describe("calculateEstimate: normal job", () => {
  const r = calculateEstimate(deck());

  it("multiplies time by rate", () => {
    expect(r.labor).toEqual([
      { id: "carpenter", amount: 1200 },
      { id: "helper", amount: 720 },
    ]);
    expect(r.laborSubtotal).toBe(1920);
  });

  it("adds markup to material cost and keeps the cost and markup apart", () => {
    expect(r.materials).toEqual([
      { id: "boards", cost: 499.2, markup: 124.8, amount: 624 },
      { id: "screws", cost: 116.91, markup: 23.38, amount: 140.29 },
    ]);
    expect(r.materialsCost).toBe(616.11);
    expect(r.materialsMarkup).toBe(148.18);
    expect(r.materialsSubtotal).toBe(764.29);
  });

  it("adds flat and per-unit adders", () => {
    expect(r.adders.map((a) => a.amount)).toEqual([150, 170]);
    expect(r.addersTotal).toBe(320);
  });

  it("applies a labor multiplier only to labor and a whole-estimate one to everything", () => {
    expect(r.laborTotal).toBe(2112);
    expect(r.materialsTotal).toBe(764.29);
    expect(r.subtotal).toBe(3196.29);
    expect(r.preTax).toBe(3356.1);
    expect(r.totalAdjustment).toBe(159.81);
    expect(r.multipliers).toEqual([
      { id: "height", appliesTo: "labor", amount: 192 },
      { id: "rush", appliesTo: "total", amount: 159.81 },
    ]);
  });

  it("taxes only the taxable part, scaled by whole-estimate multipliers", () => {
    expect(r.taxRatePct).toBe(6);
    expect(r.taxableAmount).toBe(802.5);
    expect(r.tax).toBe(48.15);
    expect(r.total).toBe(3404.25);
    expect(r.roundingAdjustment).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it("rounds the total up to the next $10 and shows what rounding added", () => {
    const up = calculateEstimate({ ...deck(), rounding: { increment: 10, direction: "up" } });
    expect(up.total).toBe(3410);
    expect(up.roundingAdjustment).toBe(5.75);
    const nearest = calculateEstimate({ ...deck(), rounding: { increment: 5, direction: "nearest" } });
    expect(nearest.total).toBe(3405);
    const down = calculateEstimate({ ...deck(), rounding: { increment: 100, direction: "down" } });
    expect(down.total).toBe(3400);
    expect(down.roundingAdjustment).toBe(-4.25);
  });

  it("taxes the whole price when every part is taxable", () => {
    const all = calculateEstimate({ ...deck(), tax: { ratePct: 6, taxable: { labor: true, materials: true, adders: true } } });
    expect(all.taxableAmount).toBe(3356.1);
    expect(all.tax).toBe(201.37);
    expect(all.total).toBe(3557.47);
  });

  it("stacks multipliers on the same part one after another", () => {
    const r2 = calculateEstimate(est({ labor: [labor("a", 10, 100)], multipliers: [mult("m1", 1.1, "labor"), mult("m2", 1.1, "labor")] }));
    expect(r2.laborTotal).toBe(1210);
    expect(r2.multipliers.map((m) => m.amount)).toEqual([100, 110]);
  });

  it("allows a discount multiplier below 1", () => {
    const r2 = calculateEstimate(est({ materials: [mat("a", 1, 200, 50)], multipliers: [mult("repeat customer", 0.9, "materials")] }));
    expect(r2.materialsTotal).toBe(270);
    expect(r2.multipliers[0].amount).toBe(-30);
  });
});

describe("calculateEstimate: zero cases", () => {
  it("returns all zeros for an empty estimate", () => {
    const r = calculateEstimate(EMPTY_ESTIMATE);
    expect(r).toMatchObject({ laborSubtotal: 0, laborTotal: 0, materialsCost: 0, materialsTotal: 0, addersTotal: 0, subtotal: 0, preTax: 0, taxableAmount: 0, tax: 0, roundingAdjustment: 0, total: 0 });
    expect(r.issues).toEqual([]);
  });

  it("treats zero quantities, rates and costs as $0 lines without complaint", () => {
    const r = calculateEstimate(est({ labor: [labor("a", 0, 75), labor("b", 8, 0)], materials: [mat("c", 0, 10, 25), mat("d", 5, 0, 25)], adders: [adder("e", 0, 150)] }));
    expect(r.total).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it("charges cost when markup is 0", () => {
    const r = calculateEstimate(est({ materials: [mat("a", 3, 9.99, 0)] }));
    expect(r.materials[0]).toEqual({ id: "a", cost: 29.97, markup: 0, amount: 29.97 });
  });

  it("adds no tax at a 0% rate even when parts are taxable", () => {
    const r = calculateEstimate({ ...deck(), tax: { ratePct: 0, taxable: { labor: true, materials: true, adders: true } } });
    expect(r.tax).toBe(0);
    expect(r.taxableAmount).toBe(0);
    expect(r.total).toBe(3356.1);
  });

  it("adds no tax when nothing is marked taxable", () => {
    const r = calculateEstimate({ ...deck(), tax: { ratePct: 6, taxable: { labor: false, materials: false, adders: false } } });
    expect(r.tax).toBe(0);
  });

  it("leaves a $0 estimate at $0 through multipliers, tax and rounding up", () => {
    const r = calculateEstimate(est({ multipliers: [mult("m", 1.5, "total")], tax: { ratePct: 6, taxable: { labor: true, materials: true, adders: true } }, rounding: { increment: 100, direction: "up" } }));
    expect(r.total).toBe(0);
    expect(r.multipliers[0].amount).toBe(0);
  });

  it("is a no-op for a multiplier with nothing to apply to", () => {
    const r = calculateEstimate(est({ adders: [adder("a", 1, 100)], multipliers: [mult("m", 1.2, "labor")] }));
    expect(r.total).toBe(100);
    expect(r.multipliers[0].amount).toBe(0);
  });
});

describe("calculateEstimate: edge cases", () => {
  it("handles fractional hours and quantities to the cent", () => {
    const r = calculateEstimate(est({ labor: [labor("a", 2.5, 67.33)], materials: [mat("b", 0.333, 10)] }));
    expect(r.labor[0].amount).toBe(168.33);
    expect(r.materials[0].amount).toBe(3.33);
  });

  it("does not drift when many small lines add up", () => {
    const lines = Array.from({ length: 10 }, (_, i) => mat(`m${i}`, 0.1, 1.1));
    const r = calculateEstimate(est({ materials: lines }));
    expect(r.materialsTotal).toBe(1.1);
  });

  it("copes with very large jobs", () => {
    const r = calculateEstimate(est({ labor: [labor("a", 100000, 125.5)], materials: [mat("b", 50000, 999.99, 35)] }));
    expect(r.laborTotal).toBe(12550000);
    expect(r.materialsTotal).toBe(67499325);
    expect(r.total).toBe(80049325);
  });

  it("ignores negative or non-numbers on a line and says which field", () => {
    const r = calculateEstimate(est({ labor: [labor("neg", -2, 75), labor("ok", 1, 75)], materials: [mat("nan", 2, NaN, 10)], adders: [adder("inf", 1, Infinity)] }));
    expect(r.labor.map((l) => l.amount)).toEqual([0, 75]);
    expect(r.materials[0].amount).toBe(0);
    expect(r.adders[0].amount).toBe(0);
    expect(r.total).toBe(75);
    expect(r.issues.map((i) => `${i.id}.${i.field}`)).toEqual(["neg.quantity", "nan.unitCost", "inf.price"]);
  });

  it("treats a markup out of range as 0% and flags it", () => {
    const r = calculateEstimate(est({ materials: [mat("a", 1, 100, 5000), mat("b", 1, 100, -10)] }));
    expect(r.materialsTotal).toBe(200);
    expect(r.issues.map((i) => i.field)).toEqual(["markupPct", "markupPct"]);
  });

  it("ignores a multiplier with a bad factor or target", () => {
    const r = calculateEstimate(
      est({
        labor: [labor("a", 1, 100)],
        multipliers: [mult("zero", 0, "labor"), mult("huge", 11, "labor"), mult("nan", NaN, "total"), { id: "bad", name: "bad", factor: 1.2, appliesTo: "tax" as never }],
      }),
    );
    expect(r.total).toBe(100);
    expect(r.multipliers.every((m) => m.amount === 0)).toBe(true);
    expect(r.issues.map((i) => `${i.id}.${i.field}`)).toEqual(["zero.factor", "huge.factor", "nan.factor", "bad.appliesTo"]);
  });

  it("flags a bad tax rate or rounding amount and falls back to no tax and cents", () => {
    const r = calculateEstimate({ ...deck(), tax: { ratePct: -5, taxable: { labor: true, materials: true, adders: true } }, rounding: { increment: 0, direction: "up" } });
    expect(r.tax).toBe(0);
    expect(r.total).toBe(3356.1);
    expect(r.issues.map((i) => `${i.id}.${i.field}`)).toEqual(["tax.ratePct", "rounding.increment"]);
  });

  it("uses no tax and cent rounding when they are left out", () => {
    const r = calculateEstimate({ labor: [labor("a", 1, 10.005)], materials: [], adders: [], multipliers: [] });
    expect(r.tax).toBe(0);
    expect(r.total).toBe(10.01);
  });

  it("rounds half a cent of tax up", () => {
    // $8.25 at 6% = $0.495 → $0.50
    const r = calculateEstimate(est({ adders: [adder("a", 1, 8.25)], tax: { ratePct: 6, taxable: { labor: false, materials: false, adders: true } } }));
    expect(r.tax).toBe(0.5);
    expect(r.total).toBe(8.75);
  });

  it("always adds up exactly: lines, multipliers, tax and rounding make the total", () => {
    // Deterministic pseudo-random jobs.
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const money = (max: number) => Math.round(rand() * max * 1000) / 1000;
    const cents = (n: number) => Math.round(n * 100);
    for (let i = 0; i < 300; i++) {
      const input = est({
        labor: Array.from({ length: 3 }, (_, k) => labor(`l${k}`, money(40), money(150))),
        materials: Array.from({ length: 4 }, (_, k) => mat(`m${k}`, money(200), money(80), Math.round(rand() * 60))),
        adders: [adder("a", Math.ceil(rand() * 3), money(400))],
        multipliers: [mult("x", 1 + rand() / 2, "labor"), mult("y", 0.8 + rand() / 2, "materials"), mult("z", 0.9 + rand() / 3, "total"), mult("w", 1 + rand() / 5, "total")],
        tax: { ratePct: Math.round(rand() * 1000) / 100, taxable: { labor: rand() > 0.5, materials: rand() > 0.5, adders: rand() > 0.5 } },
        rounding: { increment: [0.01, 1, 5, 10, 50][i % 5], direction: (["nearest", "up", "down"] as const)[i % 3] },
      });
      const r = calculateEstimate(input);
      const multSum = (t: string) => r.multipliers.filter((m) => m.appliesTo === t).reduce((s, m) => s + cents(m.amount), 0);
      expect(r.issues).toEqual([]);
      expect(cents(r.laborSubtotal) + multSum("labor")).toBe(cents(r.laborTotal));
      expect(cents(r.materialsSubtotal) + multSum("materials")).toBe(cents(r.materialsTotal));
      expect(cents(r.materialsCost) + cents(r.materialsMarkup)).toBe(cents(r.materialsSubtotal));
      expect(cents(r.laborTotal) + cents(r.materialsTotal) + cents(r.addersTotal)).toBe(cents(r.subtotal));
      expect(cents(r.subtotal) + multSum("total")).toBe(cents(r.preTax));
      expect(cents(r.preTax) + cents(r.tax) + cents(r.roundingAdjustment)).toBe(cents(r.total));
      expect(r.taxableAmount).toBeLessThanOrEqual(r.preTax);
      expect(Number.isInteger(cents(r.total))).toBe(true);
      expect(Math.abs(r.total * 100 - cents(r.total))).toBeLessThan(1e-6);
    }
  });
});

describe("lineFromItem", () => {
  const item = (p: Partial<PriceItem>): Pick<PriceItem, "kind" | "name" | "unit" | "price" | "markupPct" | "factor" | "appliesTo"> => ({
    kind: "labor",
    name: "Item",
    unit: "hr",
    price: null,
    markupPct: null,
    factor: null,
    appliesTo: null,
    ...p,
  });

  it("copies each kind of price book item onto the right section", () => {
    expect(lineFromItem(item({ kind: "labor", name: "Carpenter", unit: "hr", price: 75 }), "1", 8)).toEqual({ section: "labor", line: { id: "1", name: "Carpenter", unit: "hr", quantity: 8, rate: 75 } });
    expect(lineFromItem(item({ kind: "material", name: "Drywall", unit: "sheet", price: 14.5, markupPct: 20 }), "2", 30)).toEqual({
      section: "materials",
      line: { id: "2", name: "Drywall", unit: "sheet", quantity: 30, unitCost: 14.5, markupPct: 20 },
    });
    expect(lineFromItem(item({ kind: "adder", name: "Permit", unit: "job", price: 150 }), "3")).toEqual({ section: "adders", line: { id: "3", name: "Permit", unit: "job", quantity: 1, price: 150 } });
    expect(lineFromItem(item({ kind: "multiplier", name: "Second story", unit: "", factor: 1.15, appliesTo: "labor" }), "4")).toEqual({
      section: "multipliers",
      line: { id: "4", name: "Second story", factor: 1.15, appliesTo: "labor" },
    });
  });

  it("fills missing numbers with safe defaults", () => {
    expect(lineFromItem(item({ kind: "material", price: null, markupPct: null }), "x").line).toMatchObject({ unitCost: 0, markupPct: 0 });
    expect(lineFromItem(item({ kind: "multiplier", factor: null, appliesTo: null }), "y").line).toMatchObject({ factor: 1, appliesTo: "total" });
  });
});
