import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  combine,
  EVENT_COLORS,
  KIND_COLORS,
  KIND_LABELS,
  toDateKey,
  toTimeValue,
  type CalendarEvent,
  type EventColor,
  type EventKind,
  type EventStatus,
  type NewCalendarEvent,
} from "../../core/calendar";
import { COLOR_NAMES, CrewChip, useCrews } from "../../core/crews";
import { useTickets, type Person, type TicketSummary } from "../../core/tickets";
import { Button, SelectField, Sheet, TextAreaField, TextField } from "../../ui";

export type SheetState =
  | {
      mode: "new";
      start: Date;
      end: Date;
      /** Starting values, e.g. a job from the scheduling board: kind, status, ticket, crew and title filled in. */
      preset?: Partial<Pick<NewCalendarEvent, "title" | "kind" | "status" | "ticketId" | "crewId">>;
    }
  | { mode: "edit"; event: CalendarEvent }
  | null;

interface Draft {
  title: string;
  kind: EventKind;
  status: EventStatus;
  date: string;
  startTime: string;
  endTime: string;
  ticketId: string;
  crewId: string;
  assignedTo: string;
  color: EventColor | "";
  notes: string;
}

function draftFrom(state: NonNullable<SheetState>): Draft {
  if (state.mode === "new") {
    const p = state.preset ?? {};
    return {
      title: p.title ?? "",
      kind: p.kind ?? "site_visit",
      status: p.status ?? "confirmed",
      date: toDateKey(state.start),
      startTime: toTimeValue(state.start),
      endTime: toTimeValue(state.end),
      ticketId: p.ticketId ?? "",
      crewId: p.crewId ?? "",
      assignedTo: "",
      color: "",
      notes: "",
    };
  }
  const e = state.event;
  const s = new Date(e.start);
  return {
    title: e.title,
    kind: e.kind,
    status: e.status,
    date: toDateKey(s),
    startTime: toTimeValue(s),
    endTime: toTimeValue(new Date(e.end)),
    ticketId: e.ticketId ?? "",
    crewId: e.crewId ?? "",
    assignedTo: e.assignedTo ?? "",
    color: e.color ?? "",
    notes: e.notes,
  };
}

/** Times from the form. An end at or before the start means the booking runs past midnight only if it's 00:00. */
function timesFrom(d: Draft, original?: CalendarEvent): { start: Date; end: Date } | null {
  const start = combine(d.date, d.startTime);
  let end = combine(d.date, d.endTime);
  if (!start || !end) return null;
  // Keep multi-day bookings multi-day: the end date moves with the start date.
  if (original) {
    const os = new Date(original.start);
    const oe = new Date(original.end);
    const extraDays = Math.round((new Date(oe).setHours(0, 0, 0, 0) - new Date(os).setHours(0, 0, 0, 0)) / 86_400_000);
    if (extraDays > 0) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + extraDays, end.getHours(), end.getMinutes());
  }
  if (d.endTime === "00:00" && end <= start) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return { start, end };
}

interface EventSheetProps {
  state: SheetState;
  editable: boolean;
  people: Person[];
  onClose: () => void;
  onSave: (input: NewCalendarEvent, existing?: CalendarEvent) => Promise<void>;
  onDelete: (event: CalendarEvent) => Promise<void>;
}

/** Add or edit one booking. Read-only for roles that can't change the calendar. */
export function EventSheet({ state, editable, people, onClose, onSave, onDelete }: EventSheetProps) {
  const ticketsApi = useTickets();
  const { crews, crewById } = useCrews();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(state ? draftFrom(state) : null);
    setError("");
    setBusy(false);
  }, [state]);

  useEffect(() => {
    if (!state || !editable) return;
    let live = true;
    ticketsApi
      .list()
      .then((t) => live && setTickets(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [state, editable, ticketsApi]);

  if (!state || !draft) return null;
  const existing = state.mode === "edit" ? state.event : undefined;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const ro = !editable;
  const formId = "calendar-event-form";

  const pickTicket = (id: string) => {
    const t = tickets.find((x) => x.id === id);
    setDraft((d) => (d ? { ...d, ticketId: id, title: (d.title.trim() || !t) ? d.title : t.title } : d));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return setError("Give the booking a short title.");
    const times = timesFrom(draft, existing);
    if (!times) return setError("Pick a date, start and end time.");
    if (times.end <= times.start) return setError("The end time must be after the start.");
    setBusy(true);
    setError("");
    try {
      await onSave(
        {
          title: draft.title.trim(),
          kind: draft.kind,
          status: draft.status,
          start: times.start.toISOString(),
          end: times.end.toISOString(),
          ticketId: draft.ticketId || null,
          crewId: draft.crewId || null,
          assignedTo: draft.assignedTo || null,
          color: draft.color || null,
          notes: draft.notes,
        },
        existing,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      await onDelete(existing);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  // Open tickets to link, plus the one already linked even if it has closed since.
  const ticketOptions = tickets.filter((t) => !["lost", "paid"].includes(t.stage) || t.id === draft.ticketId);
  const activePeople = people.filter((p) => p.active || p.id === draft.assignedTo);
  const crewOptions = crews.filter((c) => c.active || c.id === draft.crewId);
  const crew = crewById(draft.crewId);
  const autoColor = crew?.color ?? KIND_COLORS[draft.kind];

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? (editable ? "Edit booking" : "Booking") : "New booking"}
      footer={
        editable ? (
          <>
            {existing && (
              <Button variant="danger" onClick={remove} disabled={busy} className="cal-delete">
                Delete
              </Button>
            )}
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId} disabled={busy}>
              {busy ? "Saving…" : existing ? "Save" : "Add to calendar"}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <form id={formId} className="stack" onSubmit={submit} noValidate>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <TextField label="Title" value={draft.title} onChange={(e) => set("title", e.target.value)} disabled={ro} autoFocus={!existing} required />
        <div className="cal-form-pair">
          <SelectField label="Type" value={draft.kind} onChange={(e) => set("kind", e.target.value as EventKind)} disabled={ro}>
            {(Object.keys(KIND_LABELS) as EventKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Status"
            value={draft.status}
            onChange={(e) => set("status", e.target.value as EventStatus)}
            disabled={ro}
            info="Tentative (soft) bookings are pencilled in and show striped. Confirm them once the customer and crew are set."
          >
            <option value="confirmed">Confirmed</option>
            <option value="tentative">Tentative (soft)</option>
          </SelectField>
        </div>
        <TextField label="Date" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} disabled={ro} />
        <div className="cal-form-pair">
          <TextField label="Starts" type="time" step={900} value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} disabled={ro} />
          <TextField label="Ends" type="time" step={900} value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={ro} />
        </div>
        {editable ? (
          <SelectField label="Ticket" value={draft.ticketId} onChange={(e) => pickTicket(e.target.value)} hint="Optional. Links the booking to a job.">
            <option value="">No ticket</option>
            {existing?.ticketId && !ticketOptions.some((t) => t.id === existing.ticketId) && <option value={existing.ticketId}>{existing.ticketLabel}</option>}
            {ticketOptions.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.number} {t.title}
                {t.customer ? ` · ${t.customer}` : ""}
              </option>
            ))}
          </SelectField>
        ) : null}
        {existing?.ticketNumber && (
          <p className="cal-ticket-link">
            <Link to={`/tickets/${existing.ticketNumber}`}>Open ticket {existing.ticketLabel}</Link>
            {existing.site && <span className="muted"> · {existing.site}</span>}
          </p>
        )}
        <SelectField
          label="Crew"
          value={draft.crewId}
          onChange={(e) => set("crewId", e.target.value)}
          disabled={ro}
          hint={crews.length === 0 && editable ? "Add crews in Settings to color bookings by crew." : undefined}
        >
          <option value="">No crew</option>
          {crewOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (retired)"}
            </option>
          ))}
        </SelectField>
        {crew && (
          <p className="crew-preview">
            <CrewChip name={crew.name} color={crew.color} retired={!crew.active} />
            {draft.color && draft.color !== crew.color ? <span>This booking uses its own color instead.</span> : null}
          </p>
        )}
        <div className="cal-form-pair">
          <SelectField label="Assigned to" value={draft.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} disabled={ro}>
            <option value="">Nobody yet</option>
            {activePeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Color"
            value={draft.color}
            onChange={(e) => set("color", e.target.value as EventColor | "")}
            disabled={ro}
            info="Automatic uses the crew's color. With no crew it's blue for site visits, teal for jobs and slate for other bookings."
          >
            <option value="">
              Automatic ({COLOR_NAMES[autoColor].toLowerCase()}
              {crew ? `, ${crew.name}` : ""})
            </option>
            {EVENT_COLORS.map((c) => (
              <option key={c} value={c}>
                {COLOR_NAMES[c]}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField label="Notes" value={draft.notes} onChange={(e) => set("notes", e.target.value)} disabled={ro} rows={3} />
      </form>
    </Sheet>
  );
}
