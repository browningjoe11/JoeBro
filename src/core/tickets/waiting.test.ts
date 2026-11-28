import { ALL_ROLES } from "../modules";
import { ALL_STAGES, canEditStage, DEFAULT_TRANSITIONS, type Stage } from "./stages";
import type { TicketSummary } from "./types";
import { countByStage, isTicketOverdue, STAGE_NEXT_ACTION, waitingOn, WORK_ROLES } from "./waiting";

const now = new Date(2026, 10, 28, 9);
const at = (days: number) => new Date(2026, 10, 28 + days, 12).toISOString();

let n = 1000;
function ticket(stage: Stage, extra: Partial<TicketSummary> = {}): TicketSummary {
  n++;
  return {
    id: `t${n}`,
    number: n,
    title: `${stage} job`,
    stage,
    stageChangedAt: at(-3),
    customer: "Pat",
    site: "",
    trade: "Decks",
    estimatedValue: null,
    nextActionAt: null,
    assignedTo: null,
    isExample: false,
    ...extra,
  };
}

/** One ticket in every stage. */
const everyStage = ALL_STAGES.map((s) => ticket(s));
const stagesOf = (ts: TicketSummary[]) => ts.map((t) => t.stage).sort();

describe("which tickets wait on which role", () => {
  it("lists exactly the tickets waiting on each role", () => {
    expect(stagesOf(waitingOn("sales", everyStage, now))).toEqual(["estimate_sent", "estimating", "lead", "site_visit"]);
    expect(stagesOf(waitingOn("operations", everyStage, now))).toEqual(["scheduling", "signed"]);
    expect(stagesOf(waitingOn("technician", everyStage, now))).toEqual(["onsite", "scheduled"]);
    expect(stagesOf(waitingOn("reviewer", everyStage, now))).toEqual(["invoicing", "review"]);
  });

  it("puts every open ticket on exactly one role's list, and closed ones on none", () => {
    for (const t of everyStage) {
      const on = WORK_ROLES.filter((r) => waitingOn(r, [t], now).length === 1);
      expect(on).toHaveLength(t.stage === "paid" || t.stage === "lost" ? 0 : 1);
    }
  });

  it("gives admin everything that waits on someone", () => {
    expect(waitingOn("admin", everyStage, now)).toHaveLength(ALL_STAGES.length - 2);
  });

  it("only assigns a stage to a role that can move it forward", () => {
    for (const s of ALL_STAGES) {
      const a = STAGE_NEXT_ACTION[s];
      if (!a) continue;
      expect(canEditStage(a.role, s)).toBe(true);
      const forward = DEFAULT_TRANSITIONS.filter((t) => t.from === s && t.to !== "lost" && canEditStage(a.role, t.to));
      expect(forward.length).toBeGreaterThan(0);
    }
    expect(ALL_ROLES).toContain("admin");
  });

  it("sorts overdue first, then by follow-up date, then oldest in stage", () => {
    const later = ticket("estimating", { nextActionAt: at(5) });
    const noDateOld = ticket("estimating", { stageChangedAt: at(-20) });
    const noDateNew = ticket("estimating", { stageChangedAt: at(-1) });
    const overdue = ticket("estimating", { nextActionAt: at(-2) });
    const soon = ticket("estimating", { nextActionAt: at(1) });
    const order = waitingOn("sales", [later, noDateNew, overdue, noDateOld, soon], now).map((t) => t.number);
    expect(order).toEqual([overdue, soon, later, noDateOld, noDateNew].map((t) => t.number));
  });
});

describe("overdue flags and stage counts", () => {
  it("is overdue only once the follow-up day has passed", () => {
    expect(isTicketOverdue({ nextActionAt: at(-1) }, now)).toBe(true);
    expect(isTicketOverdue({ nextActionAt: at(0) }, now)).toBe(false);
    expect(isTicketOverdue({ nextActionAt: null }, now)).toBe(false);
  });

  it("counts tickets and overdue ones per stage, ignoring dates on closed tickets", () => {
    const c = countByStage(
      [ticket("lead"), ticket("lead", { nextActionAt: at(-4) }), ticket("signed"), ticket("paid", { nextActionAt: at(-9) })],
      now,
    );
    expect(c.lead).toEqual({ stage: "lead", count: 2, overdue: 1 });
    expect(c.signed.count).toBe(1);
    expect(c.paid).toEqual({ stage: "paid", count: 1, overdue: 0 });
    expect(c.review.count).toBe(0);
  });
});
