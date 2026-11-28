import type { Role } from "../modules";
import { PIPELINE, type Stage } from "./stages";
import type { TicketSummary } from "./types";

/** The roles a ticket can be waiting on. Admins can step in anywhere, so nothing waits on admin alone. */
export type WorkRole = Exclude<Role, "admin">;
export const WORK_ROLES: readonly WorkRole[] = ["sales", "operations", "technician", "reviewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  sales: "Sales",
  operations: "Operations",
  technician: "Technician",
  reviewer: "Reviewer",
};

export interface NextAction {
  /** Who has to act for the ticket to move forward. */
  role: WorkRole;
  /** What they have to do, e.g. "Estimate to write". */
  label: string;
}

/**
 * What each stage is waiting for, and whose job it is. Paid and lost tickets
 * wait on nobody. Each role here can make the stage's forward move
 * (see canEditStage / ticket_stage_transitions).
 */
export const STAGE_NEXT_ACTION: Record<Stage, NextAction | null> = {
  lead: { role: "sales", label: "Lead to contact" },
  site_visit: { role: "sales", label: "Site visit to do" },
  estimating: { role: "sales", label: "Estimate to write" },
  estimate_sent: { role: "sales", label: "Signature to chase" },
  signed: { role: "operations", label: "Job to schedule" },
  scheduling: { role: "operations", label: "Date to confirm" },
  scheduled: { role: "technician", label: "Job to start" },
  onsite: { role: "technician", label: "Job to finish" },
  review: { role: "reviewer", label: "Report to review" },
  invoicing: { role: "reviewer", label: "Payment to collect" },
  paid: null,
  lost: null,
};

/** Stages where the next move is the technician's, so an unassigned ticket there has nobody to pick it up. */
const TECH_STAGES: readonly Stage[] = ["scheduled", "onsite"];

/**
 * What this ticket is waiting for, and who has to act. Same as STAGE_NEXT_ACTION,
 * except a ticket in a technician stage with no technician assigned: technicians
 * can only see tickets assigned to them (RLS), so it would show on nobody's list.
 * It waits on operations to assign someone instead.
 */
export function nextActionFor(t: Pick<TicketSummary, "stage" | "assignedTo">): NextAction | null {
  const a = STAGE_NEXT_ACTION[t.stage];
  if (a && a.role === "technician" && !t.assignedTo && TECH_STAGES.includes(t.stage)) {
    return { role: "operations", label: "Technician to assign" };
  }
  return a;
}

/** Stages whose next move belongs to this role (every waiting stage for admin). */
export function stagesWaitingOn(role: Role): Stage[] {
  return PIPELINE.filter((s) => {
    const a = STAGE_NEXT_ACTION[s];
    return a !== null && (role === "admin" || a.role === role);
  });
}

const startOfToday = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

/** The follow-up date has passed (before today). */
export function isTicketOverdue(t: Pick<TicketSummary, "nextActionAt">, now = new Date()): boolean {
  return !!t.nextActionAt && new Date(t.nextActionAt).getTime() < startOfToday(now);
}

/** Whole days since the ticket entered its current stage. */
export function daysInStage(t: Pick<TicketSummary, "stageChangedAt">, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(t.stageChangedAt).getTime()) / 86_400_000));
}

/**
 * Exactly the tickets waiting on this role, most urgent first: overdue, then
 * by follow-up date, then tickets with no date, longest in stage first.
 * Admin gets every ticket that is waiting on someone. A technician-stage ticket
 * with no technician assigned counts as waiting on operations (see nextActionFor).
 */
export function waitingOn(role: Role, tickets: readonly TicketSummary[], now = new Date()): TicketSummary[] {
  const due = (t: TicketSummary) => (t.nextActionAt ? new Date(t.nextActionAt).getTime() : Infinity);
  return tickets
    .filter((t) => {
      const a = nextActionFor(t);
      return a !== null && (role === "admin" || a.role === role);
    })
    .sort(
      (a, b) =>
        Number(isTicketOverdue(b, now)) - Number(isTicketOverdue(a, now)) ||
        due(a) - due(b) ||
        new Date(a.stageChangedAt).getTime() - new Date(b.stageChangedAt).getTime() ||
        a.number - b.number,
    );
}

export interface StageCount {
  stage: Stage;
  count: number;
  overdue: number;
}

/** How many tickets sit in each stage, and how many of those are overdue. */
export function countByStage(tickets: readonly TicketSummary[], now = new Date()): Record<Stage, StageCount> {
  const out = {} as Record<Stage, StageCount>;
  for (const s of [...PIPELINE, "lost"] as Stage[]) out[s] = { stage: s, count: 0, overdue: 0 };
  for (const t of tickets) {
    out[t.stage].count++;
    if (STAGE_NEXT_ACTION[t.stage] && isTicketOverdue(t, now)) out[t.stage].overdue++;
  }
  return out;
}
