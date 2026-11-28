import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import { useCurrentUser } from "../../core/currentUser";
import { ALL_STAGES, CREATOR_ROLES, STAGE_LABELS, useTickets, type Stage, type TicketSummary } from "../../core/tickets";
import { Badge, Button, DataTable, SelectField, TextField, usePersistentState, type Column } from "../../ui";
import { formatDate, formatMoney, isOverdue, relativeDay, stageTone } from "./format";

type Filter = "open" | "all" | Stage;

export function TicketList() {
  const backend = useTickets();
  const { role } = useCurrentUser();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = usePersistentState<Filter>("jb.tickets.filter", "open");

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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tickets ?? []).filter((t) => {
      if (filter === "open" && (t.stage === "paid" || t.stage === "lost")) return false;
      if (filter !== "open" && filter !== "all" && t.stage !== filter) return false;
      if (!q) return true;
      return [String(t.number), t.title, t.customer, t.site, t.trade].some((v) => v.toLowerCase().includes(q));
    });
  }, [tickets, query, filter]);

  const columns: Column<TicketSummary>[] = [
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
      key: "stage",
      header: "Stage",
      render: (t) => (
        <span className="ticket-badges">
          <Badge tone={stageTone(t.stage)}>{STAGE_LABELS[t.stage]}</Badge>
          {t.isExample && <Badge>Example</Badge>}
        </span>
      ),
    },
    { key: "trade", header: "Trade", render: (t) => t.trade },
    {
      key: "next",
      header: "Next action",
      render: (t) =>
        t.nextActionAt ? (
          <span className={isOverdue(t.nextActionAt) ? "overdue" : undefined} title={formatDate(t.nextActionAt)}>
            {relativeDay(t.nextActionAt)}
          </span>
        ) : (
          ""
        ),
    },
    {
      key: "value",
      header: "Value",
      numeric: true,
      render: (t) => formatMoney(t.estimatedValue),
    },
  ];

  return (
    <ModulePage title="Tickets" description="Every job from first call to paid.">
      <div className="toolbar">
        <TextField
          label="Search"
          type="search"
          placeholder="Ticket #, customer, address or trade"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <SelectField label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="open">Open tickets</option>
          <option value="all">All tickets</option>
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </SelectField>
        {CREATOR_ROLES.includes(role) && (
          <Button variant="primary" icon={<Icon name="plus" />} onClick={() => navigate("/tickets/new")}>
            New ticket
          </Button>
        )}
      </div>
      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load tickets: {error}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(t) => t.id}
          caption={`${shown.length} ${shown.length === 1 ? "ticket" : "tickets"}`}
          empty={
            tickets === null
              ? "Loading…"
              : query || filter !== "all"
                ? "No tickets match. Try another search or Show: All tickets."
                : "No tickets yet."
          }
        />
      )}
    </ModulePage>
  );
}
