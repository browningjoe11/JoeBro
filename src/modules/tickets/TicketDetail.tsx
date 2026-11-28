import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ModulePage } from "../../core/ModulePage";
import { useCurrentUser } from "../../core/currentUser";
import { useSettings } from "../../core/settings";
import {
  canEditStage,
  movesFor,
  PIPELINE,
  STAGE_LABELS,
  useTickets,
  type Person,
  type Stage,
  type Ticket,
  type TicketEvent,
  type Transition,
} from "../../core/tickets";
import { Badge, Button, Section, SelectField, Sheet, TextAreaField, TextField } from "../../ui";
import { formatMoney, fromDateInput, parseMoney, stageTone, toDateInput } from "./format";
import { StageBar } from "./StageBar";
import { Timeline } from "./Timeline";

export function TicketDetail() {
  const { number } = useParams();
  const backend = useTickets();
  const user = useCurrentUser();
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [losing, setLosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await backend.get(Number(number));
      setTicket(t);
      setEvents(t ? await backend.events(t.id) : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [backend, number]);

  useEffect(() => {
    void load();
    backend
      .transitions()
      .then(setTransitions)
      .catch(() => setTransitions([]));
    backend
      .people()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [backend, load]);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  if (error && !ticket) {
    return (
      <ModulePage title="Ticket" description="">
        <p className="settings-error" role="alert">
          Couldn't load this ticket: {error}
        </p>
      </ModulePage>
    );
  }
  if (ticket === undefined) {
    return (
      <ModulePage title="Ticket" description="Loading…">
        <p className="settings-help">Loading…</p>
      </ModulePage>
    );
  }
  if (ticket === null) {
    return (
      <ModulePage title="Ticket not found" description="It may have been deleted, or your role can't open it.">
        <p>
          <Link to="/tickets">← All tickets</Link>
        </p>
      </ModulePage>
    );
  }

  const t = ticket;
  const moves = movesFor(user.role, t.stage, transitions);
  const forward = moves.filter((m) => m.to !== "lost");
  const canLose = moves.some((m) => m.to === "lost");
  const lostFrom = t.stage === "lost" ? (events.find((e) => e.kind === "stage_changed" && e.toStage === "lost")?.fromStage ?? null) : null;
  const canEdit = canEditStage(user.role, t.stage) && (user.role !== "technician" || t.assignedTo === user.id);

  async function move(to: Stage, lostReason?: string) {
    setMoving(true);
    setMoveError(null);
    try {
      await backend.move(t.id, to, lostReason);
      setLosing(false);
      await load();
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setMoving(false);
    }
  }

  const isBack = (m: Transition) => PIPELINE.indexOf(m.to) < PIPELINE.indexOf(m.from) && m.from !== "lost";

  return (
    <ModulePage title={`#${t.number} ${t.title}`} description={[t.customer, t.site].filter(Boolean).join(" · ")}>
      <p className="back-link">
        <Link to="/tickets">← All tickets</Link>
      </p>

      <div className="ticket-stage">
        <div className="ticket-stage-head">
          <span className="ticket-badges">
            <Badge tone={stageTone(t.stage)}>{STAGE_LABELS[t.stage]}</Badge>
            {t.isExample && <Badge>Example</Badge>}
          </span>
          {t.estimatedValue !== null && <span className="ticket-value">{formatMoney(t.estimatedValue)}</span>}
        </div>
        <StageBar stage={t.stage} lostFrom={lostFrom} />
        {t.stage === "lost" && t.lostReason && (
          <p className="ticket-lost">
            <strong>Lost:</strong> {t.lostReason}
          </p>
        )}
        {moves.length > 0 ? (
          <div className="ticket-moves">
            {forward.map((m) => (
              <Button key={m.to} variant={isBack(m) ? "secondary" : "primary"} disabled={moving} onClick={() => void move(m.to)}>
                {m.label}
              </Button>
            ))}
            {canLose && (
              <Button variant="ghost" className="btn--danger-text" disabled={moving} onClick={() => setLosing(true)}>
                Mark lost
              </Button>
            )}
          </div>
        ) : (
          t.stage !== "paid" && <p className="settings-help">Another team moves this ticket from {STAGE_LABELS[t.stage]}.</p>
        )}
        {moveError && (
          <p className="settings-error" role="alert">
            {moveError}
          </p>
        )}
      </div>

      <DetailsSection ticket={t} people={people} canEdit={canEdit} onSaved={load} />

      <Section title="Customer and site" storageKey="tickets.customer">
        <dl className="facts">
          <dt>Customer</dt>
          <dd>{t.customer}</dd>
          <dt>Phone</dt>
          <dd>{t.phone ? <a href={`tel:${t.phone.replace(/[^\d+]/g, "")}`}>{t.phone}</a> : "—"}</dd>
          <dt>Email</dt>
          <dd>{t.email ? <a href={`mailto:${t.email}`}>{t.email}</a> : "—"}</dd>
          <dt>Job site</dt>
          <dd>{t.site || "—"}</dd>
        </dl>
      </Section>

      <Section title="Activity" storageKey="tickets.activity" summary={`${events.length} ${events.length === 1 ? "entry" : "entries"}`}>
        <NoteForm
          onAdd={async (text) => {
            await backend.addNote(t.id, text, user.id);
            await load();
          }}
        />
        <Timeline events={events} people={peopleById} />
      </Section>

      <LostSheet open={losing} busy={moving} error={moveError} onClose={() => setLosing(false)} onConfirm={(reason) => void move("lost", reason)} />
    </ModulePage>
  );
}

function DetailsSection({
  ticket: t,
  people,
  canEdit,
  onSaved,
}: {
  ticket: Ticket;
  people: Person[];
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const backend = useTickets();
  const { choices } = useSettings();
  const initial = useMemo(
    () => ({
      title: t.title,
      trade: t.trade,
      leadSource: t.leadSource,
      value: t.estimatedValue === null ? "" : String(t.estimatedValue),
      next: toDateInput(t.nextActionAt),
      assignedTo: t.assignedTo ?? "",
      scope: t.scope,
    }),
    [t],
  );
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setDraft(initial), [initial]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [...list, v] : list);

  async function save(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!draft.title.trim()) errs.title = "The ticket needs a title.";
    const value = parseMoney(draft.value);
    if (Number.isNaN(value)) errs.value = "Enter an amount like 12500.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setMessage(null);
    try {
      await backend.update(t.id, {
        title: draft.title,
        trade: draft.trade,
        leadSource: draft.leadSource,
        estimatedValue: value,
        nextActionAt: draft.next === initial.next ? undefined : fromDateInput(draft.next),
        assignedTo: draft.assignedTo || null,
        scope: draft.scope,
      });
      await onSaved();
      setMessage({ ok: true, text: "Saved." });
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Job details" storageKey="tickets.details">
      <form className="settings-form" onSubmit={save} noValidate>
        <fieldset className="plain-fieldset" disabled={!canEdit || busy}>
          <TextField label="Title" value={draft.title} error={errors.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <div className="settings-grid">
            <SelectField label="Trade" value={draft.trade} onChange={(e) => setDraft({ ...draft, trade: e.target.value })}>
              <option value="">Not set</option>
              {withCurrent(choices("trade"), t.trade).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </SelectField>
            <SelectField label="Lead source" value={draft.leadSource} onChange={(e) => setDraft({ ...draft, leadSource: e.target.value })}>
              <option value="">Unknown</option>
              {withCurrent(choices("lead_source"), t.leadSource).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </SelectField>
            <TextField
              label="Value"
              prefix="$"
              inputMode="decimal"
              value={draft.value}
              error={errors.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            />
            <TextField
              label="Next action"
              type="date"
              value={draft.next}
              onChange={(e) => setDraft({ ...draft, next: e.target.value })}
              info="The next follow-up or due date. The dashboard flags tickets when this day passes."
            />
            <SelectField label="Assigned to" value={draft.assignedTo} onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value })}>
              <option value="">Nobody yet</option>
              {people
                .filter((p) => p.active || p.id === t.assignedTo)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </SelectField>
          </div>
          <TextAreaField label="Scope of work" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })} />
        </fieldset>
        {canEdit ? (
          <div className="settings-actions">
            <Button type="submit" variant="primary" disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save details"}
            </Button>
            {dirty && !busy && (
              <Button variant="ghost" onClick={() => (setDraft(initial), setErrors({}))}>
                Undo changes
              </Button>
            )}
            {message && (
              <p className={message.ok ? "settings-notice" : "settings-error"} role={message.ok ? "status" : "alert"}>
                {message.text}
              </p>
            )}
          </div>
        ) : (
          <p className="settings-help">Your role can't edit tickets at {STAGE_LABELS[t.stage]}. You can still add notes below.</p>
        )}
      </form>
    </Section>
  );
}

function NoteForm({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(text);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="note-form" onSubmit={submit}>
      <TextAreaField
        label="Add a note"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Called the customer, left a voicemail…"
        error={error ?? undefined}
      />
      <Button type="submit" disabled={busy || !text.trim()}>
        {busy ? "Adding…" : "Add note"}
      </Button>
    </form>
  );
}

function LostSheet({
  open,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("");
      setMissing(false);
    }
  }, [open]);
  const confirm = () => (reason.trim() ? onConfirm(reason) : setMissing(true));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mark this job lost"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={confirm}>
            {busy ? "Saving…" : "Mark lost"}
          </Button>
        </>
      }
    >
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <TextAreaField
          label="Why didn't it go ahead?"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={missing ? "A short reason helps later, e.g. “Price: went with another contractor”." : (error ?? undefined)}
          hint="You can reopen a lost ticket later."
        />
      </form>
    </Sheet>
  );
}
