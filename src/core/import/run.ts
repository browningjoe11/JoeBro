import { parseCrmExport } from "./parse";
import { planImport } from "./plan";
import type { ImportBackend, ImportReport } from "./types";

export interface RunOptions {
  dryRun: boolean;
  actorId: string | null;
}

/** Parse, compare with what's stored, and (unless this is a dry run) write. */
export async function runImport(backend: ImportBackend, text: string, filename: string, opts: RunOptions): Promise<ImportReport> {
  const parsed = parseCrmExport(text, filename);
  if (parsed.fileError) {
    const empty = { create: 0, match: 0, skip: 0, invalid: 0 };
    return {
      dryRun: opts.dryRun,
      fileError: parsed.fileError,
      contacts: { ...empty },
      properties: { ...empty },
      tickets: { ...empty },
      notes: { ...empty },
      stages: { lead: 0, site_visit: 0, estimating: 0, estimate_sent: 0, signed: 0, scheduling: 0, scheduled: 0, onsite: 0, review: 0, invoicing: 0, paid: 0, lost: 0 },
      contactRows: [],
      ticketRows: [],
      issues: [],
      contactNotes: 0,
    };
  }
  const snap = await backend.snapshot();
  const { actions, report } = planImport(parsed, snap);
  report.dryRun = opts.dryRun;
  if (opts.dryRun || actions.length === 0) return report;
  const failures = await backend.apply(actions, opts.actorId);
  if (failures.length) {
    report.issues = [
      ...report.issues,
      ...failures.map((f) => ({ severity: "skip" as const, entity: f.op, label: f.key, message: f.message })),
    ];
  }
  return report;
}
