import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import { useEstimates, type Estimate } from "../../core/estimate";
import { useTickets, type TicketSummary } from "../../core/tickets";
import { Badge, Button, DataTable, TextField, type Column } from "../../ui";
import { formatDateTime, formatMoney } from "./format";

type Row = Estimate & { ticket: TicketSummary | undefined };

export function EstimateList() {
  const backend = useEstimates();
  const tickets = useTickets();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([backend.list(), tickets.list()])
      .then(([es, ts]) => {
        if (!live) return;
        const byId = new Map(ts.map((t) => [t.id, t]));
        setRows(es.map((e) => ({ ...e, ticket: byId.get(e.ticketId) })));
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [backend, tickets]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.title, r.ticket ? `#${r.ticket.number}` : "", r.ticket?.title ?? "", r.ticket?.customer ?? "", r.ticket?.site ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const columns: Column<Row>[] = [
    {
      key: "estimate",
      header: "Estimate",
      render: (r) => (
        <span className="ticket-cell">
          <Link to={`/sales/estimates/${r.id}`} className="ticket-link">
            {r.title}
          </Link>
          <small>
            {r.ticket ? `#${r.ticket.number} ${r.ticket.title}` : "Ticket not available"}
            {r.isExample && " · Example"}
          </small>
        </span>
      ),
    },
    { key: "customer", header: "Customer", render: (r) => r.ticket?.customer ?? "" },
    {
      key: "versions",
      header: "Versions",
      render: (r) => (r.versionCount ? <Badge tone="info">v{r.versionCount} saved</Badge> : <Badge>Draft</Badge>),
    },
    { key: "updated", header: "Last changed", render: (r) => formatDateTime(r.updatedAt) },
    { key: "total", header: "Total", numeric: true, render: (r) => formatMoney(r.total) },
  ];

  return (
    <ModulePage title="Sales" description="Estimates for your tickets. Pick one to keep working on it, or start a new one.">
      <div className="toolbar">
        <TextField label="Search" type="search" placeholder="Estimate, ticket #, customer or address" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="primary" icon={<Icon name="plus" />} onClick={() => navigate("/sales/new")}>
          New estimate
        </Button>
      </div>
      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load estimates: {error}
        </p>
      ) : rows === null ? (
        <p className="settings-help">Loading…</p>
      ) : (
        <DataTable
          caption="Estimates"
          columns={columns}
          rows={shown}
          rowKey={(r) => r.id}
          empty={query ? "No estimates match. Try another word." : "No estimates yet. Start one from a ticket or with New estimate."}
        />
      )}
    </ModulePage>
  );
}
