import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ModulePage } from "../../core/ModulePage";
import { CONTACT_EDITOR_ROLES, EMPTY_CONTACT, EMPTY_PROPERTY, useContacts, validateContact, validateProperty } from "../../core/contacts";
import { useCurrentUser } from "../../core/currentUser";
import { Button, Section } from "../../ui";
import { ContactFields, DuplicateWarning, useDuplicateCheck } from "./ContactForm";
import { PropertyFields } from "./PropertyForm";

export function NewContact() {
  const backend = useContacts();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [person, setPerson] = useState(EMPTY_CONTACT);
  const [place, setPlace] = useState({ ...EMPTY_PROPERTY, label: "Home", isPrimary: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const matches = useDuplicateCheck(person);

  if (!CONTACT_EDITOR_ROLES.includes(user.role)) return <Navigate to="/contacts" replace />;

  const hasAddress = !!(place.street.trim() || place.city.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = { ...validateContact(person), ...(hasAddress ? validateProperty(place) : {}) };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFailure(null);
    try {
      const id = await backend.create(person, user.id);
      if (hasAddress) await backend.addProperty(id, place);
      navigate(`/contacts/${id}`);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <ModulePage title="New customer" description="Who they are, how to reach them, and where the work is.">
      <p className="back-link">
        <Link to="/contacts">← All customers</Link>
      </p>
      <form className="ticket-form" onSubmit={submit} noValidate>
        <Section title="Customer" storageKey="contacts.new.person">
          <div className="stack">
            <ContactFields value={person} onChange={setPerson} errors={errors} />
            <DuplicateWarning matches={matches} />
          </div>
        </Section>
        <Section title="Property" storageKey="contacts.new.property" info="Their first job site. You can add more properties on the customer's page.">
          <div className="stack">
            <PropertyFields value={place} onChange={setPlace} errors={errors} canChangePrimary={false} />
            <p className="settings-help">Leave the address blank if you don't know it yet.</p>
          </div>
        </Section>
        <div className="settings-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : matches.length ? "Save anyway" : "Save customer"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/contacts")}>
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
