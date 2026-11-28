import { checkItem, normalizeItem, type PriceBookBackend, type PriceItem, type PriceItemInput } from "./types";

const ex = (i: Omit<PriceItem, "active" | "isExample" | "description" | "trade" | "markupPct" | "factor" | "appliesTo"> & Partial<PriceItem>): PriceItem => ({
  description: "",
  trade: "",
  markupPct: null,
  factor: null,
  appliesTo: null,
  active: true,
  isExample: true,
  ...i,
});

/** Same items as supabase/seed.sql, so preview mode looks like the sample data. */
function sample(): PriceItem[] {
  return [
    ex({ id: "pb1", kind: "labor", name: "Carpenter", description: "Lead carpenter, per hour.", trade: "Carpentry", unit: "hr", price: 75 }),
    ex({ id: "pb2", kind: "labor", name: "Helper", description: "General labor and cleanup, per hour.", unit: "hr", price: 45 }),
    ex({ id: "pb3", kind: "labor", name: "Painter", trade: "Painting", unit: "hr", price: 60 }),
    ex({ id: "pb4", kind: "material", name: "Composite deck board 16 ft", description: "Grooved edge, includes hidden fasteners.", trade: "Decks", unit: "ea", price: 52, markupPct: 20 }),
    ex({ id: "pb5", kind: "material", name: "Pressure-treated 2×10×12", description: "Joist stock.", trade: "Decks", unit: "ea", price: 24.5, markupPct: 20 }),
    ex({ id: "pb6", kind: "material", name: "Vinyl siding", description: "Double 4 in, per square foot installed area.", trade: "Siding", unit: "sq ft", price: 1.85, markupPct: 25 }),
    ex({ id: "pb7", kind: "material", name: "Drywall sheet 4×8 ½ in", trade: "Drywall", unit: "ea", price: 15, markupPct: 25 }),
    ex({ id: "pb8", kind: "adder", name: "Building permit", description: "County permit and inspection fees.", unit: "job", price: 150 }),
    ex({ id: "pb9", kind: "adder", name: "Dump trailer load", description: "Haul-away and disposal of debris.", unit: "load", price: 225 }),
    ex({ id: "pb10", kind: "adder", name: "Travel beyond 30 miles", description: "Charged per mile past the free zone.", unit: "mile", price: 1.5 }),
    ex({ id: "pb11", kind: "multiplier", name: "Difficult access", description: "Tight crawlspace, steep lot or no truck access.", unit: "", price: null, factor: 1.15, appliesTo: "labor" }),
    ex({ id: "pb12", kind: "multiplier", name: "Second-story height", description: "Ladders or staging above 12 ft.", unit: "", price: null, factor: 1.2, appliesTo: "labor" }),
    ex({ id: "pb13", kind: "multiplier", name: "Rush job", description: "Start within a week or after-hours work.", unit: "", price: null, factor: 1.1, appliesTo: "total" }),
  ];
}

/** Price book kept in memory for preview mode and tests. Follows the same rules as the database. */
export function memoryPriceBook(opts: { empty?: boolean } = {}) {
  let items: PriceItem[] = opts.empty ? [] : sample();
  let n = 0;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function check(next: PriceItemInput, id: string | null, active: boolean) {
    const errors = Object.values(checkItem(next));
    if (errors.length) throw new Error(errors[0]);
    const clash = items.find((i) => i.id !== id && active && i.active && i.kind === next.kind && i.name.toLowerCase() === next.name.toLowerCase());
    if (clash) throw new Error(`There's already an active item called ${clash.name}.`);
  }

  const backend: PriceBookBackend = {
    async list() {
      await tick();
      return items.map((i) => ({ ...i }));
    },
    async create(input) {
      await tick();
      const next = normalizeItem(input);
      check(next, null, true);
      const id = `pb-new-${++n}`;
      items = [...items, { ...next, id, active: true, isExample: false }];
      return id;
    },
    async update(id, patch) {
      await tick();
      const cur = items.find((i) => i.id === id);
      if (!cur) throw new Error("That item no longer exists.");
      const { active = cur.active, ...rest } = patch;
      const next = normalizeItem({ ...cur, ...rest, kind: cur.kind });
      check(next, id, active);
      items = items.map((i) => (i.id === id ? { ...i, ...next, active } : i));
    },
  };
  return { backend, items: () => items };
}
