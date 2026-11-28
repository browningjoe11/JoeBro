import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { normalizePhone, useContacts, type ContactInput, type DuplicateMatch } from "../../core/contacts";
import { useSettings } from "../../core/settings";
import { SelectField, TextAreaField, TextField } from "../../ui";

/** Other customers sharing this phone or email, checked as the person types. */
export function useDuplicateCheck(input: Pick<ContactInput, "phone" | "phoneAlt" | "email">, excludeId?: string) {
  const backend = useContacts();
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const { phone, phoneAlt, email } = input;
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      backend
        .findDuplicates({ phone, phoneAlt, email }, excludeId)
        .then((m) => live && setMatches(m))
        .catch(() => live && setMatches([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [backend, phone, phoneAlt, email, excludeId]);
  return matches;
}

const REASON: Record<DuplicateMatch["reasons"][number], string> = { phone: "phone number", email: "email" };

export function DuplicateWarning({ matches, title = "This might be a customer you already have" }: { matches: DuplicateMatch[]; title?: string }) {
  if (matches.length === 0) return null;
  return (
    <div className="dup-warning" role="status">
      <strong>{title}</strong>
      <ul>
        {matches.map((m) => (
          <li key={m.id}>
            <Link to={`/contacts/${m.id}`}>{m.name}</Link> has the same {m.reasons.map((r) => REASON[r]).join(" and ")}
            {m.phone || m.email ? <span className="muted"> ({[m.phone, m.email].filter(Boolean).join(" · ")})</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "3025550142" → "(302) 555-0142", so numbers read the same everywhere. Anything else is left alone. */
export function tidyPhone(v: string): string {
  const d = normalizePhone(v);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v.trim();
}

export function ContactFields({
  value,
  onChange,
  errors,
}: {
  value: ContactInput;
  onChange: (v: ContactInput) => void;
  errors: Record<string, string>;
}) {
  const { choices } = useSettings();
  const set = <K extends keyof ContactInput>(key: K, v: ContactInput[K]) => onChange({ ...value, [key]: v });
  const sources = choices("lead_source");
  return (
    <div className="settings-form">
      <div className="settings-grid">
        <TextField label="First name" value={value.firstName} error={errors.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" />
        <TextField label="Last name" value={value.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" />
        <TextField
          label="Company"
          value={value.company}
          onChange={(e) => set("company", e.target.value)}
          autoComplete="off"
          hint="Optional. For property managers and businesses."
        />
      </div>
      <div className="settings-grid">
        <TextField
          label="Phone"
          type="tel"
          inputMode="tel"
          value={value.phone}
          error={errors.phone}
          onChange={(e) => set("phone", e.target.value)}
          onBlur={() => set("phone", tidyPhone(value.phone))}
          autoComplete="off"
        />
        <TextField
          label="Other phone"
          type="tel"
          inputMode="tel"
          value={value.phoneAlt}
          error={errors.phoneAlt}
          onChange={(e) => set("phoneAlt", e.target.value)}
          onBlur={() => set("phoneAlt", tidyPhone(value.phoneAlt))}
          autoComplete="off"
        />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          value={value.email}
          error={errors.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="settings-grid">
        <SelectField label="Best way to reach them" value={value.preferredContact} onChange={(e) => set("preferredContact", e.target.value as ContactInput["preferredContact"])}>
          <option value="phone">Call</option>
          <option value="text">Text</option>
          <option value="email">Email</option>
        </SelectField>
        <SelectField
          label="Lead source"
          value={value.leadSource}
          onChange={(e) => set("leadSource", e.target.value)}
          info="Where the customer heard about you. Admins edit this list in Settings."
        >
          <option value="">Unknown</option>
          {sources.map((t) => (
            <option key={t}>{t}</option>
          ))}
          {value.leadSource && !sources.includes(value.leadSource) && <option>{value.leadSource}</option>}
        </SelectField>
      </div>
      <TextAreaField label="Notes" value={value.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything the team should know: best times, who to ask for." />
    </div>
  );
}
