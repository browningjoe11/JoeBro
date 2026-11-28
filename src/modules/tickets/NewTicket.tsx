import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ModulePage } from "../../core/ModulePage";
import { useCurrentUser } from "../../core/currentUser";
import { useSettings } from "../../core/settings";
import { CREATOR_ROLES, START_STAGES, STAGE_LABELS, useTickets, type ContactOption, type Stage } from "../../core/tickets";
import { Button, Section, SelectField, TextAreaField, TextField } from "../../ui";
import { parseMoney } from "./format";

const NEW = "__new";

export function NewTicket() {
  const backend = useTickets();
  const user = useCurrentUser();
  const { choices } = useSettings();
  const navigate = useNavigate();

  // Customer
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ContactOption[]>([]);
  const [customer, setCustomer] = useState<ContactOption | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [person, setPerson] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  // Site
  const [propertyId, setPropertyId] = useState<string>(NEW);
  const [address, setAddress] = useState({ street: "", city: "", zip: "" });
  // Job
  const [job, setJob] = useState({
    title: "",
    trade: "",
    leadSource: "",
    scope: "",
    value: "",
    stage: "lead" as Stage,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (customer || addingCustomer) return;
    let live = true;
    const t = setTimeout(() => {
      backend
        .searchContacts(search)
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [backend, search, customer, addingCustomer]);

  if (!CREATOR_ROLES.includes(user.role)) return <Navigate to="/tickets" replace />;

  function pick(c: ContactOption) {
    setCustomer(c);
    setPropertyId(c.properties.find((p) => p.isPrimary)?.id ?? c.properties[0]?.id ?? NEW);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!customer && !addingCustomer) errs.customer = "Pick a customer, or add a new one.";
    if (addingCustomer && !`${person.firstName}${person.lastName}`.trim()) errs.firstName = "Enter the customer's name.";
    if (addingCustomer && person.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(person.email.trim()))
      errs.email = "That email doesn't look right.";
    if (propertyId === NEW && (address.street.trim() || address.city.trim())) {
      if (!address.street.trim()) errs.street = "Enter the street address.";
      if (!address.city.trim()) errs.city = "Enter the city.";
      if (address.zip.trim() && !/^\d{5}(-\d{4})?$/.test(address.zip.trim())) errs.zip = "ZIP should be 5 digits.";
    }
    if (!job.title.trim()) errs.title = "Give the job a short title, like “Rebuild back deck”.";
    const value = parseMoney(job.value);
    if (Number.isNaN(value)) errs.value = "Enter an amount like 12500.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setFailure(null);
    try {
      const number = await backend.create(
        {
          contactId: customer?.id,
          newContact: addingCustomer ? person : undefined,
          propertyId: propertyId === NEW ? undefined : propertyId,
          newProperty: propertyId === NEW && address.street.trim() ? address : undefined,
          title: job.title,
          trade: job.trade,
          scope: job.scope,
          leadSource: job.leadSource,
          estimatedValue: value,
          stage: job.stage,
        },
        user.id,
      );
      navigate(`/tickets/${number}`);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const trades = choices("trade");
  const sources = choices("lead_source");

  return (
    <ModulePage title="New ticket" description="Who it's for, where the work is, and what they asked for.">
      <p className="back-link">
        <Link to="/tickets">← All tickets</Link>
      </p>
      <form className="ticket-form" onSubmit={submit} noValidate>
        <Section title="Customer" storageKey="tickets.new.customer">
          {customer ? (
            <div className="picked">
              <span>
                <strong>{customer.name}</strong>
                <small>{[customer.phone, customer.email].filter(Boolean).join(" · ")}</small>
              </span>
              <Button size="sm" variant="ghost" onClick={() => (setCustomer(null), setPropertyId(NEW))}>
                Change
              </Button>
            </div>
          ) : addingCustomer ? (
            <div className="settings-form">
              <div className="settings-grid">
                <TextField
                  label="First name"
                  value={person.firstName}
                  error={errors.firstName}
                  onChange={(e) => setPerson({ ...person, firstName: e.target.value })}
                  autoComplete="off"
                />
                <TextField
                  label="Last name"
                  value={person.lastName}
                  onChange={(e) => setPerson({ ...person, lastName: e.target.value })}
                  autoComplete="off"
                />
                <TextField
                  label="Phone"
                  type="tel"
                  inputMode="tel"
                  value={person.phone}
                  onChange={(e) => setPerson({ ...person, phone: e.target.value })}
                  autoComplete="off"
                />
                <TextField
                  label="Email"
                  type="email"
                  inputMode="email"
                  value={person.email}
                  error={errors.email}
                  onChange={(e) => setPerson({ ...person, email: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <p>
                <button type="button" className="link-btn" onClick={() => setAddingCustomer(false)}>
                  Pick an existing customer instead
                </button>
              </p>
            </div>
          ) : (
            <div className="settings-form">
              <TextField
                label="Find a customer"
                type="search"
                placeholder="Name, phone or email"
                value={search}
                error={errors.customer}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
              <ul className="pick-list" aria-label="Matching customers">
                {results.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c)}>
                      <strong>{c.name}</strong>
                      <small>{[c.phone, c.properties[0]?.label.split(" · ").pop()].filter(Boolean).join(" · ")}</small>
                    </button>
                  </li>
                ))}
                {search.trim() && results.length === 0 && <li className="pick-empty">No customer matches “{search.trim()}”.</li>}
              </ul>
              <p>
                <Button size="sm" onClick={() => setAddingCustomer(true)}>
                  Add a new customer
                </Button>
              </p>
            </div>
          )}
        </Section>

        <Section title="Job site" storageKey="tickets.new.site">
          <div className="settings-form">
            {customer && customer.properties.length > 0 && (
              <SelectField label="Where is the work?" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {customer.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value={NEW}>A different address…</option>
              </SelectField>
            )}
            {propertyId === NEW && (
              <div className="settings-grid">
                <TextField
                  label="Street address"
                  value={address.street}
                  error={errors.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  autoComplete="off"
                />
                <TextField
                  label="City"
                  value={address.city}
                  error={errors.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  autoComplete="off"
                />
                <TextField
                  label="ZIP"
                  inputMode="numeric"
                  value={address.zip}
                  error={errors.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  autoComplete="off"
                />
              </div>
            )}
            {propertyId === NEW && <p className="settings-help">Leave the address blank if you don't know it yet.</p>}
          </div>
        </Section>

        <Section title="The job" storageKey="tickets.new.job">
          <div className="settings-form">
            <TextField
              label="Title"
              placeholder="Rebuild back deck"
              value={job.title}
              error={errors.title}
              onChange={(e) => setJob({ ...job, title: e.target.value })}
            />
            <div className="settings-grid">
              <SelectField label="Trade" value={job.trade} onChange={(e) => setJob({ ...job, trade: e.target.value })}>
                <option value="">Not sure yet</option>
                {trades.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </SelectField>
              <SelectField
                label="Lead source"
                value={job.leadSource}
                onChange={(e) => setJob({ ...job, leadSource: e.target.value })}
                info="Where the customer heard about you. Admins edit this list in Settings."
              >
                <option value="">Unknown</option>
                {sources.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </SelectField>
              <TextField
                label="Rough value"
                prefix="$"
                inputMode="decimal"
                value={job.value}
                error={errors.value}
                onChange={(e) => setJob({ ...job, value: e.target.value })}
                hint="Optional. A guess is fine."
              />
              <SelectField label="Starts at" value={job.stage} onChange={(e) => setJob({ ...job, stage: e.target.value as Stage })}>
                {START_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextAreaField
              label="What they asked for"
              value={job.scope}
              onChange={(e) => setJob({ ...job, scope: e.target.value })}
              placeholder="Plain words: what, where, how big, anything unusual."
            />
          </div>
        </Section>

        <div className="settings-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Creating…" : "Create ticket"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/tickets")}>
            Cancel
          </Button>
          {failure && (
            <p className="settings-error" role="alert">
              {failure}
            </p>
          )}
        </div>
      </form>
    </ModulePage>
  );
}
