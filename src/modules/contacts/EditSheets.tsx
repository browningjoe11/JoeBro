import { useState, type ReactNode } from "react";
import {
  EMPTY_PROPERTY,
  useContacts,
  validateContact,
  validateProperty,
  type Contact,
  type ContactInput,
  type PropertyInput,
  type PropertyRecord,
} from "../../core/contacts";
import { Button, Sheet } from "../../ui";
import { ContactFields, DuplicateWarning, useDuplicateCheck } from "./ContactForm";
import { PropertyFields } from "./PropertyForm";
import "./contacts.css";

// Edit sheets for a customer and their job sites. Used on the contact page and on tickets (C2):
// the customer's phone, email and address live only here, so an edit from either place shows everywhere.

export const toInput = (c: Contact): ContactInput => ({
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
export const toPropertyInput = ({ id: _id, contactId: _c, ...p }: PropertyRecord): PropertyInput => p;
export function EditContact({
  contact,
  notice,
  onClose,
  onSaved,
}: {
  contact: Contact;
  /** Shown above the fields, e.g. "This changes the customer everywhere." */
  notice?: ReactNode;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
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
      {notice && <p className="sheet-notice">{notice}</p>}
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

export function EditProperty({
  contactId,
  property,
  isOnly,
  notice,
  onClose,
  onSaved,
}: {
  contactId: string;
  property: PropertyRecord | null;
  isOnly: boolean;
  notice?: ReactNode;
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
      {notice && <p className="sheet-notice">{notice}</p>}
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
