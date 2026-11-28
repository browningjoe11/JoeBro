import { calculateEstimate } from "./math";
import { checkTitle, EMPTY_LINES, linesForSaving, normalizeLines, type Estimate, type EstimatesBackend, type EstimateVersion } from "./store";

/** One sample estimate on the deck job (ticket 1001 in memoryTickets), so preview mode has something to open. */
function sample(): Estimate {
  const lines = normalizeLines({
    labor: [
      { id: "s-l1", name: "Carpenter", unit: "hr", quantity: 32, rate: 75 },
      { id: "s-l2", name: "Helper", unit: "hr", quantity: 24, rate: 45 },
    ],
    materials: [
      { id: "s-m1", name: "Composite deck board 16 ft", unit: "ea", quantity: 48, unitCost: 52, markupPct: 20 },
      { id: "s-m2", name: "Pressure-treated 2×10×12", unit: "ea", quantity: 18, unitCost: 24.5, markupPct: 20 },
    ],
    adders: [
      { id: "s-a1", name: "Building permit", unit: "job", quantity: 1, price: 150 },
      { id: "s-a2", name: "Dump trailer load", unit: "load", quantity: 1, price: 225 },
    ],
    multipliers: [],
    rounding: { increment: 1, direction: "nearest" },
  });
  const now = new Date().toISOString();
  return {
    id: "est-sample-1",
    ticketId: "t1",
    title: "Deck rebuild",
    lines,
    notes: "Tear out the old deck and build a new 12×16 ft composite deck on a pressure-treated frame.",
    internalNotes: "",
    total: calculateEstimate(lines).total,
    versionCount: 0,
    isExample: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Estimates kept in memory for preview mode and tests. Follows the same rules as the database.
 * `onVersion` stands in for the database setting the ticket's estimated value.
 */
export function memoryEstimates(opts: { empty?: boolean; onVersion?: (ticketId: string, total: number) => Promise<void> | void } = {}) {
  let estimates: Estimate[] = opts.empty ? [] : [sample()];
  let versions: EstimateVersion[] = [];
  let n = 0;
  let clock = Date.now();
  const stamp = () => new Date(++clock).toISOString();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const find = (id: string) => {
    const e = estimates.find((x) => x.id === id);
    if (!e) throw new Error("That estimate no longer exists.");
    return e;
  };

  const backend: EstimatesBackend = {
    async list(o = {}) {
      await tick();
      return estimates
        .filter((e) => !o.ticketId || e.ticketId === o.ticketId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((e) => structuredClone(e));
    },
    async get(id) {
      await tick();
      const e = estimates.find((x) => x.id === id);
      return e ? structuredClone(e) : null;
    },
    async create({ ticketId, title }, actorId) {
      void actorId;
      await tick();
      const bad = checkTitle(title);
      if (bad) throw new Error(bad);
      const t = stamp();
      const e: Estimate = {
        id: `est-new-${++n}`,
        ticketId,
        title: title.trim(),
        lines: structuredClone(EMPTY_LINES),
        notes: "",
        internalNotes: "",
        total: 0,
        versionCount: 0,
        isExample: false,
        createdAt: t,
        updatedAt: t,
      };
      estimates = [...estimates, e];
      return e.id;
    },
    async saveDraft(id, draft) {
      await tick();
      const e = find(id);
      const bad = checkTitle(draft.title);
      if (bad) throw new Error(bad);
      const next: Estimate = {
        ...e,
        title: draft.title.trim(),
        lines: normalizeLines(linesForSaving(draft.lines)),
        notes: draft.notes,
        internalNotes: draft.internalNotes,
        total: Math.max(0, draft.total),
        updatedAt: stamp(),
      };
      estimates = estimates.map((x) => (x.id === id ? next : x));
    },
    async versions(estimateId) {
      await tick();
      return versions
        .filter((v) => v.estimateId === estimateId)
        .sort((a, b) => b.version - a.version)
        .map((v) => structuredClone(v));
    },
    async saveVersion(estimateId, snap, actorId) {
      await tick();
      const e = find(estimateId);
      const bad = checkTitle(snap.title);
      if (bad) throw new Error(bad);
      const version = e.versionCount + 1;
      versions = [
        ...versions,
        {
          id: `ver-${++n}`,
          estimateId,
          version,
          title: snap.title.trim(),
          lines: normalizeLines(linesForSaving(snap.lines)),
          notes: snap.notes,
          internalNotes: snap.internalNotes,
          total: Math.max(0, snap.total),
          label: snap.label.trim(),
          createdBy: actorId,
          createdAt: stamp(),
        },
      ];
      estimates = estimates.map((x) => (x.id === estimateId ? { ...x, versionCount: version } : x));
      await opts.onVersion?.(e.ticketId, snap.total);
      return version;
    },
  };
  return { backend, estimates: () => estimates.map((e) => structuredClone(e)), versions: () => versions.map((v) => structuredClone(v)) };
}
