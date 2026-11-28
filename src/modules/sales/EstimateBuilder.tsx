import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCurrentUser } from "../../core/currentUser";
import {
  calculateEstimate,
  checkTitle,
  useEstimates,
  type Estimate,
  type EstimateDraft,
  type EstimateInput,
  type EstimateResult,
  type EstimateVersion,
  type RoundDirection,
} from "../../core/estimate";
import { ModulePage } from "../../core/ModulePage";
import { STAGE_LABELS, useTickets, type TicketSummary } from "../../core/tickets";
import { Badge, Button, CheckChips, DataTable, Section, SelectField, Sheet, TextAreaField, TextField, type Column } from "../../ui";
import { formatDateTime, formatMoney, formatSigned } from "./format";
import { AddersSection, MaterialsSection, MultipliersSection, TimeSection, type LineKey, type LinesApi } from "./LineSections";
import { NumInput } from "./NumInput";

type SaveState = { state: "saved" | "pending" | "saving" | "error"; error?: string };

/** How long to wait after the last keystroke before saving the draft. */
const AUTOSAVE_MS = 800;

const ROUNDING_CHOICES = [
  { value: "0.01", label: "To the cent" },
  { value: "1", label: "To the dollar" },
  { value: "5", label: "To $5" },
  { value: "10", label: "To $10" },
  { value: "25", label: "To $25" },
  { value: "50", label: "To $50" },
  { value: "100", label: "To $100" },
];

export function EstimateBuilder() {
  const { id = "" } = useParams();
  const backend = useEstimates();
  const tickets = useTickets();
  const user = useCurrentUser();
  const navigate = useNavigate();

  const [estimate, setEstimate] = useState<Estimate | null | undefined>(undefined);
  const [ticket, setTicket] = useState<TicketSummary | null>(null);
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [versions, setVersions] = useState<EstimateVersion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ state: "saved" });
  const [versionSheet, setVersionSheet] = useState(false);
  const [restoring, setRestoring] = useState<EstimateVersion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Autosave plumbing: the latest draft, whether it has unsaved changes, and a queue so saves run one at a time.
  const draftRef = useRef<EstimateDraft | null>(null);
  const dirty = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  draftRef.current = draft;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const e = await backend.get(id);
        if (!live) return;
        setEstimate(e);
        if (!e) return;
        setDraft({ title: e.title, lines: e.lines, notes: e.notes, internalNotes: e.internalNotes });
        const [vs, list] = await Promise.all([backend.versions(id), tickets.list()]);
        if (!live) return;
        setVersions(vs);
        setTicket(list.find((t) => t.id === e.ticketId) ?? null);
      } catch (err) {
        if (live) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [backend, tickets, id]);

  const flush = useCallback((): Promise<void> => {
    queue.current = queue.current.then(async () => {
      const d = draftRef.current;
      if (!dirty.current || !d) return;
      dirty.current = false;
      setSave({ state: "saving" });
      try {
        await backend.saveDraft(id, { ...d, total: calculateEstimate(d.lines).total }, user.id);
        setSave(dirty.current ? { state: "pending" } : { state: "saved" });
      } catch (err) {
        dirty.current = true;
        setSave({ state: "error", error: err instanceof Error ? err.message : String(err) });
      }
    });
    return queue.current;
  }, [backend, id, user.id]);

  // Save a moment after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, flush]);

  // Save anything left when leaving the screen, and warn before closing the tab with unsaved changes.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flushRef.current();
    };
  }, []);

  const change = useCallback((fn: (d: EstimateDraft) => EstimateDraft) => {
    dirty.current = true;
    setSave((s) => (s.state === "saving" ? s : { state: "pending" }));
    setNotice(null);
    setDraft((d) => (d ? fn(d) : d));
  }, []);
  const changeLines = useCallback((fn: (l: EstimateInput) => EstimateInput) => change((d) => ({ ...d, lines: fn(d.lines) })), [change]);

  const result = useMemo<EstimateResult | null>(() => (draft ? calculateEstimate(draft.lines) : null), [draft]);

  const api = useMemo<LinesApi | null>(() => {
    if (!draft || !result) return null;
    return {
      lines: draft.lines,
      result,
      trade: ticket?.trade ?? "",
      update: (key, lineId, patch) =>
        changeLines((l) => ({ ...l, [key]: (l[key] as { id: string }[]).map((x) => (x.id === lineId ? { ...x, ...patch } : x)) })),
      add: (key, line) => changeLines((l) => ({ ...l, [key]: [...l[key], line] })),
      remove: (key: LineKey, lineId: string) => changeLines((l) => ({ ...l, [key]: (l[key] as { id: string }[]).filter((x) => x.id !== lineId) })),
    };
  }, [draft, result, ticket, changeLines]);

  async function saveVersion(label: string) {
    if (!draft || !result) return;
    await flush();
    if (dirty.current) throw new Error("The draft couldn't be saved, so no version was made. Fix the problem shown at the top and try again.");
    const v = await backend.saveVersion(id, { ...draft, total: result.total, label }, user.id);
    setVersions(await backend.versions(id));
    setVersionSheet(false);
    setNotice(`Saved version ${v}. The ticket's estimated value is now ${formatMoney(result.total)}.`);
  }

  function restore(v: EstimateVersion) {
    change(() => ({ title: v.title, lines: structuredClone(v.lines), notes: v.notes, internalNotes: v.internalNotes }));
    setRestoring(null);
    setNotice(`Loaded version ${v.version} into the draft. Save a new version when it's ready.`);
  }

  if (loadError) {
    return (
      <ModulePage title="Estimate" description="">
        <p className="settings-error" role="alert">
          Couldn't load the estimate: {loadError}
        </p>
      </ModulePage>
    );
  }
  if (estimate === undefined) return <ModulePage title="Estimate" description="Loading…" />;
  if (estimate === null || !draft || !result || !api) {
    return (
      <ModulePage title="Estimate not found" description="It may have been deleted, or your role can't open it.">
        <p className="back-link">
          <Link to="/sales">← All estimates</Link>
        </p>
      </ModulePage>
    );
  }

  const titleError = checkTitle(draft.title) ?? undefined;
  const tax = draft.lines.tax ?? { ratePct: 0, taxable: { labor: false, materials: false, adders: false } };
  const rounding = draft.lines.rounding ?? { increment: 0.01, direction: "nearest" as RoundDirection };
  const taxIssue = result.issues.find((i) => i.id === "tax");
  const latest = versions[0];
  const changedSinceVersion = latest ? latest.total !== result.total || save.state !== "saved" : true;

  return (
    <ModulePage
      title={draft.title.trim() || "Estimate"}
      description={ticket ? `#${ticket.number} ${ticket.title} · ${[ticket.customer, ticket.site].filter(Boolean).join(" · ")}` : "Estimate"}
    >
      <p className="back-link">
        <Link to="/sales">← All estimates</Link>
        {ticket && (
          <>
            {" · "}
            <Link to={`/tickets/${ticket.number}`}>Ticket #{ticket.number}</Link>
          </>
        )}
      </p>

      <div className="est-layout">
        <div className="est-main">
          <div className="est-card">
            <div className="est-card-row">
              <TextField
                label="Estimate name"
                value={draft.title}
                error={titleError}
                onChange={(e) => change((d) => ({ ...d, title: e.target.value }))}
                info="A short name you'll recognize in lists, like “Deck rebuild” or “Option B: composite”. The customer sees it as the estimate's heading."
              />
              <SaveStatus save={save} onRetry={() => void flush()} />
            </div>
            {ticket && (
              <p className="est-ticket">
                <Badge>{STAGE_LABELS[ticket.stage]}</Badge>
                {ticket.trade && <span>{ticket.trade}</span>}
                <span>
                  {latest ? `Version ${latest.version} saved ${formatDateTime(latest.createdAt)}` : "No version saved yet"}
                </span>
              </p>
            )}
            {notice && (
              <p className="settings-notice" role="status">
                {notice}
              </p>
            )}
          </div>

          <TimeSection api={api} />
          <MaterialsSection api={api} />
          <AddersSection api={api} />
          <MultipliersSection api={api} />

          <Section
            title="Tax and rounding"
            storageKey="estimate.tax"
            defaultOpen={false}
            summary={tax.ratePct > 0 ? `${tax.ratePct}% tax` : "No tax"}
            info="Delaware has no sales tax, so most estimates leave this at 0%. Rounding tidies the final price, for example to the nearest $5; the difference shows as its own line."
          >
            <div className="est-tax">
              <div className={`field${taxIssue ? " field--error" : ""}`}>
                <div className="field-label">
                  <span>Tax rate</span>
                </div>
                <NumInput
                  label="Tax rate"
                  suffix="%"
                  value={tax.ratePct}
                  invalid={!!taxIssue}
                  onChange={(ratePct) => changeLines((l) => ({ ...l, tax: { ...tax, ratePct } }))}
                />
                {taxIssue && <p className="field-error">{taxIssue.message}</p>}
              </div>
              <CheckChips
                label="Taxed parts"
                options={[
                  { value: "labor", label: "Labor" },
                  { value: "materials", label: "Materials" },
                  { value: "adders", label: "Adders" },
                ]}
                value={(["labor", "materials", "adders"] as const).filter((k) => tax.taxable[k])}
                onChange={(next) =>
                  changeLines((l) => ({
                    ...l,
                    tax: { ...tax, taxable: { labor: next.includes("labor"), materials: next.includes("materials"), adders: next.includes("adders") } },
                  }))
                }
              />
              <SelectField
                label="Round the total"
                value={String(rounding.increment)}
                onChange={(e) => changeLines((l) => ({ ...l, rounding: { ...rounding, increment: Number(e.target.value) } }))}
              >
                {ROUNDING_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Round"
                value={rounding.direction}
                disabled={rounding.increment <= 0.01}
                onChange={(e) => changeLines((l) => ({ ...l, rounding: { ...rounding, direction: e.target.value as RoundDirection } }))}
              >
                <option value="nearest">To the nearest</option>
                <option value="up">Always up</option>
                <option value="down">Always down</option>
              </SelectField>
            </div>
          </Section>

          <Section
            title="Notes"
            storageKey="estimate.notes"
            info="Scope notes go on the customer's estimate: what you'll do, what's included and what isn't. Internal notes stay in the office."
          >
            <div className="est-notes">
              <TextAreaField
                label="Scope notes for the customer"
                rows={6}
                placeholder="Tear out the old deck, haul away debris, build a new 12×16 ft deck…"
                value={draft.notes}
                onChange={(e) => change((d) => ({ ...d, notes: e.target.value }))}
              />
              <TextAreaField
                label="Internal notes"
                hint="Only your team sees these."
                rows={6}
                value={draft.internalNotes}
                onChange={(e) => change((d) => ({ ...d, internalNotes: e.target.value }))}
              />
            </div>
          </Section>

          <VersionsSection versions={versions} estimateId={id} onLoad={setRestoring} />
        </div>

        <aside className="est-aside" aria-label="Estimate total">
          <Totals result={result} />
          <Button variant="primary" size="lg" className="est-save-version" disabled={!!titleError} onClick={() => setVersionSheet(true)}>
            Save version {(latest?.version ?? 0) + 1}
          </Button>
          <Button
            className="est-save-version"
            onClick={() => {
              // The saved version when nothing the customer sees has changed since; otherwise a preview of the draft.
              const same = latest && JSON.stringify([latest.title, latest.lines, latest.notes]) === JSON.stringify([draft.title, draft.lines, draft.notes]);
              const target = same ? String(latest.version) : "draft";
              void flush().then(() => navigate(`/sales/estimates/${id}/document?version=${target}`));
            }}
          >
            Preview customer estimate
          </Button>
          <p className="settings-help">
            {changedSinceVersion
              ? "The draft saves as you type. Save a version when it's ready to send, so you can always see what the customer got."
              : "No changes since the last version."}
          </p>
        </aside>
      </div>

      <div className="est-totalbar" aria-hidden="true">
        <span>Total</span>
        <strong>{formatMoney(result.total)}</strong>
      </div>

      <SaveVersionSheet open={versionSheet} next={(latest?.version ?? 0) + 1} total={result.total} onClose={() => setVersionSheet(false)} onSave={saveVersion} />

      <Sheet
        open={!!restoring}
        title={`Load version ${restoring?.version ?? ""}?`}
        onClose={() => setRestoring(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestoring(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => restoring && restore(restoring)}>
              Replace the draft
            </Button>
          </>
        }
      >
        <p>
          The draft ({formatMoney(result.total)}) will be replaced with version {restoring?.version} ({formatMoney(restoring?.total ?? 0)}). Saved versions don't change.
        </p>
      </Sheet>
    </ModulePage>
  );
}

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  if (save.state === "error") {
    return (
      <div className="est-status est-status--bad" role="alert">
        <span>Draft not saved: {save.error}</span>
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  const text = save.state === "saved" ? "Draft saved" : save.state === "saving" ? "Saving…" : "Unsaved changes";
  return (
    <p className={`est-status est-status--${save.state}`} role="status" aria-live="polite">
      {text}
    </p>
  );
}

/** The live breakdown. Every row comes from calculateEstimate, so it always adds up to the total. */
export function Totals({ result }: { result: EstimateResult }) {
  const rows: [string, string, string?][] = [
    ["Time", formatMoney(result.laborTotal)],
    ["Materials", formatMoney(result.materialsTotal)],
    ["Adders", formatMoney(result.addersTotal)],
  ];
  if (result.totalAdjustment !== 0) {
    rows.push(["Subtotal", formatMoney(result.subtotal), "sub"]);
    rows.push(["Whole-estimate multipliers", formatSigned(result.totalAdjustment)]);
  }
  if (result.tax !== 0 || result.taxRatePct > 0) {
    rows.push(["Before tax", formatMoney(result.preTax), "sub"]);
    rows.push([`Tax ${result.taxRatePct}%`, formatMoney(result.tax)]);
  }
  if (result.roundingAdjustment !== 0) rows.push(["Rounding", formatSigned(result.roundingAdjustment)]);
  return (
    <div className="est-totals">
      <h2>Total</h2>
      <dl>
        {rows.map(([k, v, cls]) => (
          <div key={k} className={cls ? `est-row est-row--${cls}` : "est-row"}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="est-row est-row--total">
          <dt>Customer price</dt>
          <dd data-testid="estimate-total">{formatMoney(result.total)}</dd>
        </div>
      </dl>
      {result.materialsCost > 0 && (
        <p className="est-margin">
          Material cost {formatMoney(result.materialsCost)}, markup {formatMoney(result.materialsMarkup)}
        </p>
      )}
      {result.issues.length > 0 && (
        <p className="est-issues" role="alert">
          {result.issues.length === 1 ? "1 number is" : `${result.issues.length} numbers are`} left out of the total until fixed. They're marked in red.
        </p>
      )}
    </div>
  );
}

function VersionsSection({ versions, estimateId, onLoad }: { versions: EstimateVersion[]; estimateId: string; onLoad: (v: EstimateVersion) => void }) {
  const columns: Column<EstimateVersion>[] = [
    { key: "v", header: "Version", render: (v) => <strong>v{v.version}</strong> },
    { key: "label", header: "What changed", render: (v) => v.label || <span className="muted">—</span> },
    { key: "when", header: "Saved", render: (v) => formatDateTime(v.createdAt) },
    { key: "total", header: "Total", numeric: true, render: (v) => formatMoney(v.total) },
    {
      key: "load",
      header: "",
      render: (v) => (
        <span className="est-version-actions">
          <Link className="btn btn--sm btn--ghost" to={`/sales/estimates/${estimateId}/document?version=${v.version}`} aria-label={`Customer estimate for version ${v.version}`}>
            Customer copy
          </Link>
          <Button size="sm" variant="ghost" aria-label={`Load version ${v.version} into the draft`} onClick={() => onLoad(v)}>
            Load into draft
          </Button>
        </span>
      ),
    },
  ];
  return (
    <Section
      title="Versions"
      storageKey="estimate.versions"
      summary={versions.length ? `${versions.length} saved` : "None yet"}
      info="A version is a saved copy of the estimate that never changes. Save one each time you send or revise an estimate. Loading a version copies it into the draft to start a revision."
    >
      <DataTable columns={columns} rows={versions} rowKey={(v) => v.id} empty="No versions yet. Use “Save version” when the estimate is ready." />
    </Section>
  );
}

function SaveVersionSheet({
  open,
  next,
  total,
  onClose,
  onSave,
}: {
  open: boolean;
  next: number;
  total: number;
  onClose: () => void;
  onSave: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setLabel("");
      setError(null);
    }
  }, [open]);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSave(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      title={`Save version ${next}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            Save version {next}
          </Button>
        </>
      }
    >
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p>
          Saves a copy of the estimate as it is now, at <strong>{formatMoney(total)}</strong>, and sets the ticket's estimated value to match.
        </p>
        <TextField label="What changed (optional)" placeholder="First estimate · Customer asked for composite boards" value={label} onChange={(e) => setLabel(e.target.value)} />
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
