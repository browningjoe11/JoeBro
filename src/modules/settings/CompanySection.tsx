import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSettings, type CompanySettings } from "../../core/settings";
import { Button, Section, TextField } from "../../ui";
import { logoFromFile } from "./logo";

type TextKey = Exclude<keyof CompanySettings, "logoDataUrl" | "disabledModules">;

export function CompanySection() {
  const { backend, company, loading, refresh } = useSettings();
  const [draft, setDraft] = useState<CompanySettings>(company);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pick up changes saved elsewhere (or the first load) when nothing is being edited.
  useEffect(() => setDraft(company), [company]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(company);
  const field = (key: TextKey, label: string, extra: Record<string, unknown> = {}) => (
    <TextField label={label} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} {...extra} />
  );

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.name.trim()) return setMessage({ tone: "bad", text: "Company name is required." });
    setBusy(true);
    setMessage(null);
    try {
      // Re-read module switches so saving the profile never undoes a change made in the Modules section.
      const latest = await backend.loadCompany();
      await backend.saveCompany({ ...draft, disabledModules: latest.disabledModules });
      await refresh();
      setMessage({ tone: "ok", text: "Company profile saved." });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    try {
      setDraft({ ...draft, logoDataUrl: await logoFromFile(file) });
      setMessage(null);
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : String(err) });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Section
      title="Company profile"
      storageKey="settings.company"
      info="Shown in the app header now, and on estimates, invoices and emails as those are built."
    >
      <form className="settings-form" onSubmit={save} noValidate>
        <div className="logo-row">
          <div className="logo-preview" aria-hidden={!draft.logoDataUrl}>
            {draft.logoDataUrl ? <img src={draft.logoDataUrl} alt="Company logo" /> : <span className="brand-mark" aria-hidden="true" />}
          </div>
          <div className="logo-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="visually-hidden"
              id="logo-file"
              aria-label="Upload logo"
              onChange={(e) => void pickLogo(e.target.files?.[0])}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              {draft.logoDataUrl ? "Change logo" : "Upload logo"}
            </Button>
            {draft.logoDataUrl && (
              <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, logoDataUrl: null })}>
                Remove logo
              </Button>
            )}
            <p className="settings-help">A square image looks best. It's shrunk to 256 pixels.</p>
          </div>
        </div>
        <fieldset className="plain-fieldset" disabled={loading}>
          <div className="settings-grid">
            {field("name", "Company name", { required: true })}
            {field("licenseNumber", "Delaware business license number", { info: "Printed on estimates and invoices." })}
            {field("phone", "Phone", { type: "tel", inputMode: "tel" })}
            {field("email", "Email", { type: "email", inputMode: "email" })}
            {field("website", "Website", { inputMode: "url" })}
            {field("street", "Street address")}
            {field("city", "City")}
            <div className="settings-grid-pair">
              {field("state", "State")}
              {field("zip", "ZIP", { inputMode: "numeric" })}
            </div>
          </div>
        </fieldset>
        <div className="settings-actions">
          <Button type="submit" variant="primary" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save company profile"}
          </Button>
          {dirty && !busy && (
            <Button variant="ghost" onClick={() => (setDraft(company), setMessage(null))}>
              Undo changes
            </Button>
          )}
          {message && (
            <p className={message.tone === "ok" ? "settings-notice" : "settings-error"} role={message.tone === "ok" ? "status" : "alert"}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </Section>
  );
}
