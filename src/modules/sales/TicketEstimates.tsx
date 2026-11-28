import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentUser } from "../../core/currentUser";
import { useEstimates, type Estimate } from "../../core/estimate";
import type { Role } from "../../core/modules";
import { Badge, Section } from "../../ui";
import { formatMoney } from "./format";

/** Roles that open and write estimates (the Sales module). Mirrors the estimates table rules. */
export const ESTIMATE_EDITOR_ROLES: readonly Role[] = ["admin", "sales"];
/** Roles that can see estimates at all. Technicians don't see prices. */
const ESTIMATE_READER_ROLES: readonly Role[] = ["admin", "sales", "operations", "reviewer"];

/** The estimates on one ticket, shown on the ticket screen. */
export function TicketEstimates({ ticketId, ticketNumber, refreshKey }: { ticketId: string; ticketNumber: number; refreshKey?: unknown }) {
  const backend = useEstimates();
  const { role } = useCurrentUser();
  const [list, setList] = useState<Estimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRead = ESTIMATE_READER_ROLES.includes(role);
  const canEdit = ESTIMATE_EDITOR_ROLES.includes(role);

  useEffect(() => {
    if (!canRead) return;
    let live = true;
    backend
      .list({ ticketId })
      .then((es) => live && setList(es))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [backend, ticketId, canRead, refreshKey]);

  if (!canRead) return null;
  return (
    <Section
      title="Estimates"
      storageKey="tickets.estimates"
      summary={list ? `${list.length}` : undefined}
      info="Estimates priced from the price book. Saving a version of an estimate sets this ticket's estimated value."
      actions={
        canEdit && (
          <Link className="btn btn--secondary btn--sm" to={`/sales/new?ticket=${ticketNumber}`}>
            New estimate
          </Link>
        )
      }
    >
      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load estimates: {error}
        </p>
      ) : list === null ? (
        <p className="settings-help">Loading…</p>
      ) : list.length === 0 ? (
        <p className="settings-help">No estimates yet.{canEdit && " Start one with New estimate."}</p>
      ) : (
        <ul className="est-ticket-list">
          {list.map((e) => (
            <li key={e.id}>
              {canEdit ? <Link to={`/sales/estimates/${e.id}`}>{e.title}</Link> : <span>{e.title}</span>}
              {e.versionCount ? <Badge tone="info">v{e.versionCount} saved</Badge> : <Badge>Draft</Badge>}
              <span className="est-ticket-total">{formatMoney(e.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
