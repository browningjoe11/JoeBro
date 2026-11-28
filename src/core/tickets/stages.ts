import type { Role } from "../modules";

/** Mirrors public.ticket_stage, in pipeline order. */
export type Stage =
  | "lead"
  | "site_visit"
  | "estimating"
  | "estimate_sent"
  | "signed"
  | "scheduling"
  | "scheduled"
  | "onsite"
  | "review"
  | "invoicing"
  | "paid"
  | "lost";

/** The main path a job takes, left to right. Lost sits off to the side. */
export const PIPELINE: readonly Stage[] = [
  "lead",
  "site_visit",
  "estimating",
  "estimate_sent",
  "signed",
  "scheduling",
  "scheduled",
  "onsite",
  "review",
  "invoicing",
  "paid",
];

export const ALL_STAGES: readonly Stage[] = [...PIPELINE, "lost"];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  site_visit: "Site visit",
  estimating: "Estimating",
  estimate_sent: "Estimate sent",
  signed: "Signed",
  scheduling: "Scheduling",
  scheduled: "Scheduled",
  onsite: "Onsite",
  review: "Review",
  invoicing: "Invoicing",
  paid: "Paid",
  lost: "Lost",
};

/** Which team owns each stage, for grouping the stage bar. */
export const STAGE_PHASE: Record<Stage, "Sales" | "Operations" | "Review" | "Closed"> = {
  lead: "Sales",
  site_visit: "Sales",
  estimating: "Sales",
  estimate_sent: "Sales",
  signed: "Sales",
  scheduling: "Operations",
  scheduled: "Operations",
  onsite: "Operations",
  review: "Review",
  invoicing: "Review",
  paid: "Closed",
  lost: "Closed",
};

/** Stages a brand-new ticket may start in (the database enforces the same). */
export const START_STAGES: readonly Stage[] = ["lead", "site_visit", "estimating"];

export interface Transition {
  from: Stage;
  to: Stage;
  /** Button text, e.g. "Send estimate". */
  label: string;
}

/** Same moves as public.ticket_stage_transitions. The live app reads the table; preview and tests use this copy. */
export const DEFAULT_TRANSITIONS: readonly Transition[] = [
  { from: "lead", to: "site_visit", label: "Book site visit" },
  { from: "lead", to: "estimating", label: "Start estimate" },
  { from: "site_visit", to: "estimating", label: "Start estimate" },
  { from: "estimating", to: "estimate_sent", label: "Send estimate" },
  { from: "estimate_sent", to: "estimating", label: "Revise estimate" },
  { from: "estimate_sent", to: "signed", label: "Mark signed" },
  { from: "signed", to: "scheduling", label: "Start scheduling" },
  { from: "scheduling", to: "scheduled", label: "Confirm schedule" },
  { from: "scheduled", to: "scheduling", label: "Reschedule" },
  { from: "scheduled", to: "onsite", label: "Start job" },
  { from: "onsite", to: "review", label: "Mark job complete" },
  { from: "review", to: "onsite", label: "Send back to tech" },
  { from: "review", to: "invoicing", label: "Approve for invoicing" },
  { from: "invoicing", to: "paid", label: "Mark paid" },
  { from: "lost", to: "lead", label: "Reopen" },
  ...ALL_STAGES.filter((s) => s !== "paid" && s !== "lost").map((s) => ({
    from: s,
    to: "lost" as Stage,
    label: "Mark lost",
  })),
];

/** Mirrors public.role_can_edit_stage: the stages each role works in. The database is the real gate. */
export function canEditStage(role: Role, stage: Stage): boolean {
  switch (role) {
    case "admin":
      return true;
    case "sales":
      return ["lead", "site_visit", "estimating", "estimate_sent", "signed", "lost"].includes(stage);
    case "operations":
      return ["signed", "scheduling", "scheduled", "onsite", "review", "lost"].includes(stage);
    case "technician":
      return ["scheduled", "onsite", "review"].includes(stage);
    case "reviewer":
      return ["onsite", "review", "invoicing", "paid"].includes(stage);
  }
}

/** Moves this role may make from a stage: both ends must be stages the role works in. */
export function movesFor(role: Role, stage: Stage, transitions: readonly Transition[]): Transition[] {
  return transitions.filter((t) => t.from === stage && canEditStage(role, t.from) && canEditStage(role, t.to));
}

/** Roles that may create tickets (public.tickets insert policy). */
export const CREATOR_ROLES: readonly Role[] = ["admin", "sales", "operations"];
