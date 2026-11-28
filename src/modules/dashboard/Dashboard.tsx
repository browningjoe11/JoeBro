import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ModulePage } from "../../core/ModulePage";
import { useCurrentUser } from "../../core/currentUser";
import type { Role } from "../../core/modules";
import {
  countByStage,
  daysInStage,
  isTicketOverdue,
  PIPELINE,
  ROLE_LABELS,
  STAGE_LABELS,
  STAGE_NEXT_ACTION,
  stagesWaitingOn,
  useTickets,
  waitingOn,
  WORK_ROLES,
  type TicketSummary,
} from "../../core/tickets";
import { Badge, DataTable, InfoTip, Section, SelectField, usePersistentState, type Column } from "../../ui";
import { formatDate, formatMoney, relativeDay, stageTone } from "../tickets/format";
import "./dashboard.css";

/** Open pipeline stages shown as count tiles (paid is history, not work). */
const COUNT_STAGES = PIPELINE.filter((s) => s !== "paid");

export function Dashboard() {
  const backend = useTickets();
  const user = useCurrentUser();
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Admins can look at any team's list; everyone else sees their own.
  const [adminView, setAdminView] = usePersistentState<Role>("jb.dashboard.view", "admin");
  const viewRole: Role = user.role === "admin" ? adminView : user.role;

  useEffect(() => {
    let live = true;
    backend
      .list()
      .then((t) => live && (setTickets(t), setError(null)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [backend]);

  const now = useMemo(() => new Date(), [tickets]);
  const waiting = useMemo(() => waitingOn(viewRole, tickets ?? [], now), [viewRole, tickets, now]);
  const overdue = waiting.filter((t) => isTicketOverdue(t, now)).length;
  const counts = useMemo(() => countByStage(tickets ?? [], now), [tickets, now]);
  const mine = new Set(stagesWaitingOn(viewRole));
  const everyone = viewRole === "admin";

  const columns: Column<TicketSummary>[] = [
    {
      key: "todo",
      header: "To do",
      render: (t) => (
        <span className="todo-cell">
          <strong>{STAGE_NEXT_ACTION[t.stage]?.label}</strong>
          {everyone && <small>{ROLE_LABELS[STAGE_NEXT_ACTION[t.stage]!.role]}</small>}
        </span>
      ),
    },
    {
      key: "ticket",
      header: "Ticket",
      render: (t) => (
        <span className="ticket-cell">
          <Link to={`/tickets/${t.number}`} className="ticket-link">
            #{t.number} {t.title}
          </Link>
          <small>
            {t.customer}
            {t.site && ` · ${t.site}`}
          </small>
        </span>
      ),
    },
    {
      key: "due",
      header: "Follow up",
      render: (t) =>
        isTicketOverdue(t, now) ? (
          <span className="due-cell" title={formatDate(t.nextActionAt)}>
            <Badge tone="bad">Overdue</Badge>
            <small className="overdue">{relativeDay(t.nextActionAt, now)}</small>
          </span>
        ) : t.nextActionAt ? (
          <span title={formatDate(t.nextActionAt)}>{relativeDay(t.nextActionAt, now)}</span>
        ) : (
          <span className="muted">No date set</span>
        ),
    },
    {
      key: "age",
      header: "In stage",
      render: (t) => {
        const d = daysInStage(t, now);
        return (
          <span className="age-cell">
            <Badge tone={stageTone(t.stage)}>{STAGE_LABELS[t.stage]}</Badge>
            <small>{d === 0 ? "today" : `${d} ${d === 1 ? "day" : "days"}`}</small>
          </span>
        );
      },
    },
    { key: "value", header: "Value", numeric: true, render: (t) => formatMoney(t.estimatedValue) },
  ];

  const who = everyone ? "anyone" : user.role === "admin" ? ROLE_LABELS[viewRole] : "you";

  return (
    <ModulePage title="Dashboard" description="What each ticket needs next to keep moving.">
      {user.role === "admin" && (
        <div className="toolbar">
          <SelectField label="Show work for" value={adminView} onChange={(e) => setAdminView(e.target.value as Role)}>
            <option value="admin">Everyone</option>
            {WORK_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load tickets: {error}
        </p>
      ) : (
        <>
          <div className="dash-stats" aria-label="Summary">
            <div className="dash-stat">
              <span className="dash-stat-num">{tickets ? waiting.length : "–"}</span>
              <span>Waiting on {who}</span>
            </div>
            <div className={`dash-stat${overdue ? " dash-stat--bad" : ""}`}>
              <span className="dash-stat-num">{tickets ? overdue : "–"}</span>
              <span>Overdue</span>
            </div>
          </div>

          <Section
            title="Next actions"
            storageKey="dashboard.next"
            summary={tickets ? `${waiting.length} ${waiting.length === 1 ? "ticket" : "tickets"}` : undefined}
            info="Tickets waiting on this role to move forward, overdue first. Overdue means the follow-up date on the ticket has passed."
          >
            <div className="next-table">
              <DataTable
                columns={columns}
                rows={waiting}
                rowKey={(t) => t.id}
                caption={`Waiting on ${who}`}
                empty={tickets === null ? "Loading…" : "Nothing is waiting on " + who + " right now."}
              />
            </div>
            {waiting.length > 0 && (
              // Phones get the same list as stacked cards instead of a wide table.
              <ul className="next-cards" aria-label={`Waiting on ${who} (cards)`}>
                {waiting.map((t) => (
                  <li key={t.id} className={isTicketOverdue(t, now) ? "next-card next-card--overdue" : "next-card"}>
                    <div className="next-card-top">
                      <strong>{STAGE_NEXT_ACTION[t.stage]?.label}</strong>
                      {columns[2].render(t)}
                    </div>
                    {columns[1].render(t)}
                    <div className="next-card-foot">
                      {columns[3].render(t)}
                      <span>{formatMoney(t.estimatedValue)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Tickets by stage"
            storageKey="dashboard.stages"
            info="Every open ticket, counted by stage. Highlighted stages are the ones waiting on this role. Click a stage to see its tickets."
          >
            <ul className="stage-counts" aria-label="Tickets by stage">
              {COUNT_STAGES.map((s) => {
                const c = counts[s];
                const owner = STAGE_NEXT_ACTION[s]!.role;
                return (
                  <li key={s} className={mine.has(s) && !everyone ? "stage-count stage-count--mine" : "stage-count"}>
                    <Link
                      to={`/tickets?show=${s}`}
                      aria-label={`${STAGE_LABELS[s]}: ${c.count}${c.overdue ? `, ${c.overdue} overdue` : ""}`}
                    >
                      <span className="stage-count-num">{tickets ? c.count : "–"}</span>
                      <span className="stage-count-name">{STAGE_LABELS[s]}</span>
                      <small>
                        {ROLE_LABELS[owner]}
                        {c.overdue > 0 && <span className="overdue"> · {c.overdue} overdue</span>}
                      </small>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="stage-counts-foot">
              Closed: {tickets ? counts.paid.count : "–"} paid, {tickets ? counts.lost.count : "–"} lost.{" "}
              <InfoTip label="About closed tickets">Paid and lost tickets wait on nobody, so they never show in next actions.</InfoTip>
            </p>
          </Section>
        </>
      )}
    </ModulePage>
  );
}
