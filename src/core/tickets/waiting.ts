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
 * Admin gets every ticket that is waiting on someone.
 */
export function waitingOn(role: Role, tickets: readonly TicketSummary[], now = new Date()): TicketSummary[] {
  const stages = new Set(stagesWaitingOn(role));
  const due = (t: TicketSummary) => (t.nextActionAt ? new Date(t.nextActionAt).getTime() : Infinity);
  return tickets
    .filter((t) => stages.has(t.stage))
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
