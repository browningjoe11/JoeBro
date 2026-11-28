import type { ReactNode } from "react";
import { CHANGE_LABELS } from "../../core/contacts/changes";
import { STAGE_LABELS, type Person, type Stage, type TicketEvent } from "../../core/tickets";
import { formatDate, formatDateTime, formatMoney } from "./format";

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  scope: "scope of work",
  trade: "trade",
  assigned_to: "assigned person",
  estimated_value: "value",
  property_id: "job site",
  next_action_at: "next action date",
};

interface TimelineProps<E extends TicketEvent> {
  events: E[];
  people: Map<string, Person>;
  /** Extra line under each entry, e.g. which ticket it was on (the customer page shows several tickets). */
  context?: (e: E) => ReactNode;
  empty?: string;
}

export function Timeline<E extends TicketEvent>({ events, people, context, empty = "Nothing has happened on this ticket yet." }: TimelineProps<E>) {
  if (events.length === 0) return <p className="settings-help">{empty}</p>;
  const who = (id: string | null) => (id ? (people.get(id)?.name ?? "A former team member") : "The system");

  function show(field: string, v: unknown): string {
    if (v === null || v === undefined || v === "") return "blank";
    if (field === "assigned_to") return people.get(String(v))?.name ?? "someone";
    if (field === "estimated_value") return formatMoney(Number(v));
    if (field === "next_action_at") return formatDate(String(v));
    if (field === "property_id") return "another site";
    const text = String(v);
    return text.length > 80 ? `“${text.slice(0, 77)}…”` : `“${text}”`;
  }

  function describe(e: TicketEvent): ReactNode {
    switch (e.kind) {
      case "created":
        return (
          <>
            created the ticket
            {e.toStage && (
              <>
                {" "}
                at <strong>{STAGE_LABELS[e.toStage]}</strong>
              </>
            )}
          </>
        );
      case "stage_changed":
        return (
          <>
            moved it from <strong>{STAGE_LABELS[e.fromStage as Stage]}</strong> to <strong>{STAGE_LABELS[e.toStage as Stage]}</strong>
            {typeof e.data.lost_reason === "string" && e.data.lost_reason && <span className="timeline-quote">Reason: {e.data.lost_reason}</span>}
          </>
        );
      case "updated":
        return (
          <>
            changed{" "}
            {Object.entries(e.data as Record<string, { from: unknown; to: unknown }>).map(([field, c], i, all) => (
              <span key={field}>
                the {FIELD_LABELS[field] ?? field} from {show(field, c?.from)} to {show(field, c?.to)}
                {i < all.length - 1 ? "; " : ""}
              </span>
            ))}
          </>
        );
      case "contact_changed": {
        const changes = (e.data.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
        const whose = e.data.site ? "the job site's" : "the customer's";
        return (
          <>
            {Object.entries(changes).map(([field, c], i, all) => (
              <span key={field}>
                {field === "site_added" ? (
                  <>added a job site {show(field, c?.to)}</>
                ) : (
                  <>
                    changed {whose} {CHANGE_LABELS[field] ?? field} from {show(field, c?.from)} to {show(field, c?.to)}
                  </>
                )}
                {i < all.length - 1 ? "; " : ""}
              </span>
            ))}
          </>
        );
      }
      case "note":
        return (
          <>
            added a note
            <span className="timeline-quote">{String(e.data.text ?? "")}</span>
          </>
        );
      default:
        return e.kind;
    }
  }

  return (
    <ol className="timeline" aria-label="Activity">
      {events.map((e) => (
        <li key={e.id} className={`timeline-item timeline-item--${e.kind}`}>
          <span className="timeline-dot" aria-hidden="true" />
          <div>
            <p className="timeline-text">
              <strong>{who(e.actorId)}</strong> {describe(e)}
            </p>
            <time className="timeline-time" dateTime={e.createdAt}>
              {formatDateTime(e.createdAt)}
            </time>
            {context && <span className="timeline-context">{context(e)}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
