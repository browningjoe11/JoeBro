import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import {
  CONTACT_EDITOR_ROLES,
  EMPTY_PROPERTY,
  useContacts,
  validateContact,
  validateProperty,
  type Contact,
  type ContactEvent,
  type ContactInput,
  type ContactTicket,
  type PropertyInput,
  type PropertyRecord,
} from "../../core/contacts";
import { useCurrentUser } from "../../core/currentUser";
import { CREATOR_ROLES, STAGE_LABELS, useTickets, type ContactOption, type Person } from "../../core/tickets";
import { Badge, Button, DataTable, Section, Sheet, type Column } from "../../ui";
import { formatDate, formatMoney, stageTone } from "../tickets/format";
import { Timeline } from "../tickets/Timeline";
import { ContactFields, DuplicateWarning, useDuplicateCheck } from "./ContactForm";
import { PropertyFields } from "./PropertyForm";

const METHOD: Record<Contact["preferredContact"], string> = { phone: "Call", text: "Text", email: "Email" };
const CLOSED = new Set(["paid", "lost"]);

const toInput = (c: Contact): ContactInput => ({
  firstName: c.firstName,
  lastName: c.lastName,
  company: c.company,
  phone: c.phone,
  phoneAlt: c.phoneAlt,
  email: c.email,
  preferredContact: c.preferredContact,
  leadSource: c.leadSource,
  notes: c.notes,
});
const toPropertyInput = ({ id: _id, contactId: _c, ...p }: PropertyRecord): PropertyInput => p;
const addressLine = (p: { street: string; unit: string; city: string; state: string; zip: string }) =>
  [[p.street, p.unit].filter(Boolean).join(" "), p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

export function ContactDetail() {
  const { id = "" } = useParams();
  const backend = useContacts();
  const tickets = useTickets();
  const { role } = useCurrentUser();
  const navigate = useNavigate();
  const canEdit = CONTACT_EDITOR_ROLES.includes(role);

  const [contact, setContact] = useState<Contact | null | undefined>(undefined);
  const [history, setHistory] = useState<ContactEvent[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingPlace, setEditingPlace] = useState<PropertyRecord | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([backend.get(id), backend.history(id)]);
      setContact(c);
      setHistory(h);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [backend, id]);

  useEffect(() => {
    setContact(undefined);
    void load();
  }, [load]);

  useEffect(() => {
    tickets
      .people()
      .then((p) => setPeople(new Map(p.map((x) => [x.id, x]))))
      .catch(() => undefined);
  }, [tickets]);

  const dupes = useDuplicateCheck(contact ?? { phone: "", phoneAlt: "", email: "" }, contact?.id);

  const totals = useMemo(() => {
    const list = contact?.tickets ?? [];
    const open = list.filter((t) => !CLOSED.has(t.stage)).length;
    const won = list.filter((t) => !["lead", "site_visit", "estimating", "estimate_sent", "lost"].includes(t.stage));
    const value = won.reduce((sum, t) => sum + (t.estimatedValue ?? 0), 0);
    return { open, value };
  }, [contact]);

  if (loadError)
    return (
      <ModulePage title="Customer" description="">
        <p className="settings-error" role="alert">
          Couldn't load this customer: {loadError}
        </p>
      </ModulePage>
    );
  if (contact === undefined)
    return (
      <ModulePage title="Customer" description="Loading…">
        <p className="muted">Loading…</p>
      </ModulePage>
    );
  if (contact === null)
    return (
      <ModulePage title="Customer not found" description="It may have been removed, or your role can't see it.">
        <p className="back-link">
          <Link to="/contacts">← All customers</Link>
        </p>
      </ModulePage>
    );

  const c = contact;
  const digits = c.phone.replace(/\D/g, "");

  function newTicket() {
    const option: ContactOption = {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      properties: c.properties.map((p) => ({ id: p.id, label: [p.label, `${p.street}, ${p.city}`].filter(Boolean).join(" · "), isPrimary: p.isPrimary })),
    };
    navigate("/tickets/new", { state: { contact: option } });
  }

  const ticketColumns: Column<ContactTicket>[] = [
    {
      key: "ticket",
      header: "Ticket",
      render: (t) => (
        <span className="ticket-cell">
          <Link to={`/tickets/${t.number}`} className="ticket-link">
            #{t.number} {t.title}
          </Link>
          <small>{[t.site, t.trade].filter(Boolean).join(" · ")}</small>
        </span>
      ),
    },
    { key: "stage", header: "Stage", render: (t) => <Badge tone={stageTone(t.stage)}>{STAGE_LABELS[t.stage]}</Badge> },
    { key: "opened", header: "Opened", render: (t) => <span className="nowrap">{formatDate(t.createdAt)}</span> },
    { key: "value", header: "Value", numeric: true, render: (t) => formatMoney(t.estimatedValue) },
  ];

  return (
    <ModulePage title={c.name} description={[c.firstName || c.lastName ? c.company : "", `Customer since ${formatDate(c.createdAt)}`].filter(Boolean).join(" · ")}>
      <p className="back-link">
        <Link to="/contacts">← All customers</Link>
      </p>

      <div className="contact-actions">
        {c.phone && (
          <a className="btn btn--secondary btn--md" href={`tel:${digits}`}>
            Call {c.phone}
          </a>
        )}
        {c.phone && (
          <a className="btn btn--secondary btn--md" href={`sms:${digits}`}>
            Text
          </a>
        )}
        {c.email && (
          <a className="btn btn--secondary btn--md" href={`mailto:${c.email}`}>
            Email
          </a>
        )}
        {CREATOR_ROLES.includes(role) && (
          <Button variant="primary" icon={<Icon name="plus" />} onClick={newTicket}>
            New ticket
          </Button>
        )}
        {(c.isExample || dupes.length > 0) && (
          <span className="ticket-badges">
            {dupes.length > 0 && <Badge tone="warn">Possible duplicate</Badge>}
            {c.isExample && <Badge>Example</Badge>}
          </span>
        )}
      </div>

      {dupes.length > 0 && <DuplicateWarning matches={dupes} title="Possible duplicate" />}

      <div className="contact-grid">
        <div className="stack">
          <Section
            title="Details"
            storageKey="contacts.detail.details"
            actions={
              canEdit && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )
            }
          >
            <dl className="facts">
              <dt>Phone</dt>
              <dd>{c.phone || <span className="muted">None</span>}</dd>
              {c.phoneAlt && (
                <>
                  <dt>Other phone</dt>
                  <dd>{c.phoneAlt}</dd>
                </>
              )}
              <dt>Email</dt>
              <dd>{c.email || <span className="muted">None</span>}</dd>
              <dt>Best way</dt>
              <dd>{METHOD[c.preferredContact]}</dd>
              <dt>Lead source</dt>
              <dd>{c.leadSource || <span className="muted">Unknown</span>}</dd>
              {c.notes && (
                <>
                  <dt>Notes</dt>
                  <dd className="pre-wrap">{c.notes}</dd>
                </>
              )}
            </dl>
          </Section>

          <Section
            title="Properties"
            storageKey="contacts.detail.properties"
            summary={String(c.properties.length)}
            actions={
              canEdit && (
                <Button size="sm" variant="ghost" icon={<Icon name="plus" size={16} />} onClick={() => setEditingPlace("new")}>
                  Add
                </Button>
              )
            }
          >
            {c.properties.length === 0 ? (
              <p className="settings-help">No properties yet.</p>
            ) : (
              <ul className="property-list">
                {c.properties.map((p) => {
                  const jobs = c.tickets.filter((t) => t.propertyId === p.id).length;
                  return (
                    <li key={p.id}>
                      <div className="property-head">
                        <strong>{p.label || "Property"}</strong>
                        {p.isPrimary && c.properties.length > 1 && <Badge tone="brand">Main</Badge>}
                        {canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => setEditingPlace(p)} aria-label={`Edit ${p.label || p.street}`}>
                            Edit
                          </Button>
                        )}
                      </div>
                      <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(addressLine(p))}`} target="_blank" rel="noreferrer">
                        {addressLine(p)}
                      </a>
                      <small>
                        {[p.county && `${p.county} County`, `${jobs} ${jobs === 1 ? "job" : "jobs"}`].filter(Boolean).join(" · ")}
                      </small>
                      {p.accessNotes && <p className="property-notes">{p.accessNotes}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="stack">
          <Section
            title="Tickets"
            storageKey="contacts.detail.tickets"
            summary={`${c.tickets.length} total · ${totals.open} open${totals.value ? ` · ${formatMoney(totals.value)} won` : ""}`}
          >
            {c.tickets.length === 0 ? (
              <p className="settings-help">No tickets yet.</p>
            ) : (
              <DataTable columns={ticketColumns} rows={c.tickets} rowKey={(t) => t.id} />
            )}
          </Section>

          <Section title="History" storageKey="contacts.detail.history" info="Everything that happened on this customer's tickets, newest first.">
            <Timeline
              events={history}
              people={people}
              empty="Nothing has happened for this customer yet."
              context={(e) => (
                <>
                  on <Link to={`/tickets/${e.ticketNumber}`}>#{e.ticketNumber} {e.ticketTitle}</Link>
                </>
              )}
            />
          </Section>
        </div>
      </div>

      {editing && <EditContact contact={c} onClose={() => setEditing(false)} onSaved={load} />}
      {editingPlace && (
        <EditProperty
          contactId={c.id}
          property={editingPlace === "new" ? null : editingPlace}
          isOnly={c.properties.length === 0 || (c.properties.length === 1 && editingPlace !== "new")}
          onClose={() => setEditingPlace(null)}
          onSaved={load}
        />
      )}
    </ModulePage>
  );
}

function EditContact({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => Promise<void> }) {
  const backend = useContacts();
  const [value, setValue] = useState(() => toInput(contact));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const matches = useDuplicateCheck(value, contact.id);

  async function save() {
    const errs = validateContact(value);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFailure(null);
    try {
      await backend.update(contact.id, value);
      await onSaved();
      onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit customer"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <ContactFields value={value} onChange={setValue} errors={errors} />
      <DuplicateWarning matches={matches} />
      {failure && (
        <p className="settings-error" role="alert">
          {failure}
        </p>
      )}
    </Sheet>
  );
}

function EditProperty({
  contactId,
  property,
  isOnly,
  onClose,
  onSaved,
}: {
  contactId: string;
  property: PropertyRecord | null;
  isOnly: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const backend = useContacts();
  const [value, setValue] = useState<PropertyInput>(() => (property ? toPropertyInput(property) : { ...EMPTY_PROPERTY, isPrimary: isOnly }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function save() {
    const errs = validateProperty(value);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFailure(null);
    try {
      if (property) await backend.updateProperty(property.id, value);
      else await backend.addProperty(contactId, value);
      await onSaved();
      onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={property ? "Edit property" : "Add property"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {/* A main property can't be un-marked directly; mark another one as main instead. */}
      <PropertyFields value={value} onChange={setValue} errors={errors} canChangePrimary={!isOnly && !property?.isPrimary} />
      {failure && (
        <p className="settings-error" role="alert">
          {failure}
        </p>
      )}
    </Sheet>
  );
}
