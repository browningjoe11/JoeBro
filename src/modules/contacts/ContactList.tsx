import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import { CONTACT_EDITOR_ROLES, duplicateMap, searchContacts, useContacts, type ContactSummary } from "../../core/contacts";
import { useCurrentUser } from "../../core/currentUser";
import { Badge, Button, DataTable, SelectField, TextField, usePersistentState, type Column } from "../../ui";
import { relativeDay } from "../tickets/format";

type Filter = "all" | "open" | "duplicates";

export function ContactList() {
  const backend = useContacts();
  const { role } = useCurrentUser();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = usePersistentState<Filter>("jb.contacts.filter", "all");

  useEffect(() => {
    let live = true;
    backend
      .list()
      .then((c) => live && (setContacts(c), setError(null)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [backend]);

  // "/" jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const dupes = useMemo(() => duplicateMap(contacts ?? []), [contacts]);
  const shown = useMemo(() => {
    const matches = searchContacts(contacts ?? [], query);
    if (filter === "open") return matches.filter((c) => c.openTicketCount > 0);
    if (filter === "duplicates") return matches.filter((c) => dupes.has(c.id));
    return matches;
  }, [contacts, query, filter, dupes]);

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && shown[0]) {
      e.preventDefault();
      navigate(`/contacts/${shown[0].id}`);
    }
  }

  const columns: Column<ContactSummary>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <span className="contact-cell">
          <Link to={`/contacts/${c.id}`} className="ticket-link">
            {c.name}
          </Link>
          <small>{[c.firstName || c.lastName ? c.company : "", c.email].filter(Boolean).join(" · ")}</small>
          {(c.isExample || dupes.has(c.id)) && (
            <span className="ticket-badges">
              {dupes.has(c.id) && <Badge tone="warn">Possible duplicate</Badge>}
              {c.isExample && <Badge>Example</Badge>}
            </span>
          )}
        </span>
      ),
    },
    { key: "phone", header: "Phone", render: (c) => <span className="nowrap">{c.phone}</span> },
    {
      key: "place",
      header: "Property",
      render: (c) =>
        c.places[0] ? (
          <span className="contact-cell">
            <span>{[c.places[0].street, c.places[0].city].filter(Boolean).join(", ")}</span>
            {c.places.length > 1 && <small>+{c.places.length - 1} more</small>}
          </span>
        ) : (
          <span className="muted">None yet</span>
        ),
    },
    {
      key: "jobs",
      header: "Jobs",
      render: (c) =>
        c.ticketCount === 0 ? (
          <span className="muted">None</span>
        ) : (
          <span className="nowrap">
            {c.ticketCount} {c.ticketCount === 1 ? "job" : "jobs"}
            {c.openTicketCount > 0 && <small className="contact-open"> · {c.openTicketCount} open</small>}
          </span>
        ),
    },
    { key: "active", header: "Last activity", render: (c) => <span className="nowrap">{relativeDay(c.lastActivityAt)}</span> },
  ];

  return (
    <ModulePage title="Contacts" description="Every customer, their properties and their job history.">
      <div className="toolbar">
        <TextField
          ref={searchRef}
          label="Search"
          type="search"
          placeholder="Name, phone, email or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          autoFocus
          autoComplete="off"
          hint="Press Enter to open the top match. Press / to come back here."
        />
        <SelectField label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">All customers</option>
          <option value="open">With an open job</option>
          <option value="duplicates">Possible duplicates{dupes.size ? ` (${dupes.size})` : ""}</option>
        </SelectField>
        {CONTACT_EDITOR_ROLES.includes(role) && (
          <Button variant="primary" icon={<Icon name="plus" />} onClick={() => navigate("/contacts/new")}>
            New customer
          </Button>
        )}
      </div>
      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load customers: {error}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(c) => c.id}
          caption={`${shown.length} ${shown.length === 1 ? "customer" : "customers"}`}
          empty={
            contacts === null
              ? "Loading…"
              : query || filter !== "all"
                ? "No customers match. Try fewer letters or Show: All customers."
                : "No customers yet."
          }
        />
      )}
    </ModulePage>
  );
}
