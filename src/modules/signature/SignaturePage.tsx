import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ColorPicker } from "../../core/crews";
import { useCurrentUser } from "../../core/currentUser";
import { ModulePage } from "../../core/ModulePage";
import { useSettings, type TeamMember } from "../../core/settings";
import {
  blankSignature,
  checkSignature,
  renderSignatureHtml,
  renderSignatureText,
  signatureHtmlFile,
  TAGLINE_MAX,
  useSignatures,
  type EmailSignature,
} from "../../core/signature";
import { Button, Section, SelectField, TextField } from "../../ui";
import { copyRichText, downloadFile } from "./clipboard";

type Message = { tone: "ok" | "bad"; text: string } | null;
type TextKey = "fullName" | "title" | "phone" | "mobile" | "email" | "tagline";

/** Login id used for the signature in preview mode, where nobody is signed in. */
const PREVIEW_ID = "preview";

export function SignaturePage() {
  const me = useCurrentUser();
  const { backend: settings, company } = useSettings();
  const signatures = useSignatures();
  const isAdmin = me.role === "admin";
  const myId = me.id ?? PREVIEW_ID;

  // Admins can set up anyone's signature; everyone else edits their own.
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [whoId, setWhoId] = useState(myId);
  useEffect(() => {
    if (!isAdmin || !me.id) return;
    settings.loadTeam().then(setTeam, () => setTeam([]));
  }, [isAdmin, me.id, settings]);
  const who = team.find((m) => m.id === whoId);
  const isMine = whoId === myId;

  const [saved, setSaved] = useState<EmailSignature | null>(null);
  const [draft, setDraft] = useState<EmailSignature | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    let live = true;
    setDraft(null);
    setMessage(null);
    setShowErrors(false);
    signatures.get(whoId).then(
      (sig) => {
        if (!live) return;
        const seed = isMine ? { fullName: me.id ? me.name : "", email: me.email ?? "" } : { fullName: who?.fullName, email: who?.email ?? "" };
        setSaved(sig);
        setDraft(sig ?? blankSignature(whoId, seed));
        setLoadError(null);
      },
      (e) => live && setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
    // `who` only seeds a blank signature; reloading when the team list arrives would drop edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatures, whoId]);

  const issues = draft ? checkSignature(draft) : {};
  const dirty = !!draft && (!saved || JSON.stringify({ ...draft, updatedAt: null }) !== JSON.stringify({ ...saved, updatedAt: null }));

  // The preview may show the stored logo; what's copied into mail apps must use the public address.
  const previewHtml = useMemo(
    () => (draft ? renderSignatureHtml(draft, company, { logoUrl: company.emailLogoUrl ?? company.logoDataUrl }) : ""),
    [draft, company],
  );
  const emailHtml = useMemo(() => (draft ? renderSignatureHtml(draft, company, { logoUrl: company.emailLogoUrl }) : ""), [draft, company]);

  if (loadError) {
    return (
      <ModulePage title="Email signature" description="The sign-off added to estimate and invoice emails.">
        <p className="settings-error" role="alert">
          Couldn't load the signature: {loadError}
        </p>
      </ModulePage>
    );
  }

  const set = <K extends keyof EmailSignature>(key: K, value: EmailSignature[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setMessage(null);
  };
  const field = (key: TextKey, label: string, extra: Record<string, unknown> = {}) =>
    draft && (
      <TextField
        label={label}
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
        error={showErrors ? issues[key] : undefined}
        {...extra}
      />
    );

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft) return;
    if (Object.keys(issues).length) {
      setShowErrors(true);
      return setMessage({ tone: "bad", text: Object.values(issues)[0]! });
    }
    setBusy(true);
    try {
      const next = await signatures.save(draft);
      setSaved(next);
      setDraft(next);
      setShowErrors(false);
      setMessage({ tone: "ok", text: "Signature saved. Estimate emails will use it." });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try {
      await copyRichText(emailHtml, renderSignatureText(draft, company));
      setMessage({ tone: "ok", text: "Signature copied. Paste it into your mail app's signature box." });
    } catch {
      setMessage({ tone: "bad", text: "This browser blocked copying. Select the preview and copy it instead." });
    }
  }

  const name = draft?.fullName.trim() || "signature";
  const title = isMine ? "Email signature" : `Email signature: ${who?.fullName || who?.email || "team member"}`;

  return (
    <ModulePage
      title={title}
      description="The sign-off added to estimate and invoice emails. It also works in Gmail and Outlook: copy it in with one click."
    >
      {isAdmin && me.id && team.length > 1 && (
        <div className="sig-who">
          <SelectField label="Whose signature" value={whoId} onChange={(e) => setWhoId(e.target.value)} info="As an admin you can set up anyone's signature.">
            {team
              .filter((m) => m.active || m.id === whoId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === myId ? `${m.fullName || m.email} (you)` : m.fullName || m.email}
                </option>
              ))}
          </SelectField>
        </div>
      )}
      {!draft ? (
        <p className="settings-help">Loading signature…</p>
      ) : (
        <div className="sig-layout">
          <form className="sig-form" onSubmit={save} noValidate>
            <Section title="Your details" storageKey="signature.details" info="How you sign off. Leave a line blank to leave it out.">
              <div className="settings-grid">
                {field("fullName", "Name", { required: true, autoComplete: "name" })}
                {field("title", "Job title", { placeholder: "Owner, Estimator, Project manager…" })}
                {field("phone", "Phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "(302) 555-0100" })}
                {field("mobile", "Mobile", { type: "tel", inputMode: "tel", hint: "Optional second number." })}
                {field("email", "Email", { type: "email", inputMode: "email", autoComplete: "email" })}
              </div>
              {field("tagline", "Closing line", {
                maxLength: TAGLINE_MAX,
                placeholder: "Licensed and insured. Serving Kent and Sussex County.",
                hint: `Optional, up to ${TAGLINE_MAX} characters. Shown in small italics at the bottom.`,
              })}
            </Section>
            <Section
              title="Company details"
              storageKey="signature.company"
              info="These come from the company profile in Settings, so everyone's signature stays the same when they change."
            >
              <ul className="sig-checks">
                <ShowRow
                  label="Company logo"
                  value={draft.showLogo}
                  onChange={(v) => set("showLogo", v)}
                  missing={!company.logoDataUrl}
                  note={<LogoNote isAdmin={isAdmin} />}
                />
                <ShowRow label="Office phone" detail={company.phone} value={draft.showCompanyPhone} onChange={(v) => set("showCompanyPhone", v)} />
                <ShowRow label="Website" detail={company.website} value={draft.showWebsite} onChange={(v) => set("showWebsite", v)} />
                <ShowRow
                  label="Address"
                  detail={[company.street, company.city].filter((x) => x.trim()).join(", ")}
                  value={draft.showAddress}
                  onChange={(v) => set("showAddress", v)}
                />
                <ShowRow
                  label="Delaware license number"
                  detail={company.licenseNumber}
                  value={draft.showLicense}
                  onChange={(v) => set("showLicense", v)}
                />
              </ul>
              <ColorPicker label="Accent color" value={draft.accent} onChange={(c) => set("accent", c)} />
            </Section>
            <div className="settings-actions">
              <Button type="submit" variant="primary" disabled={busy || !dirty}>
                {busy ? "Saving…" : "Save signature"}
              </Button>
              {dirty && saved && !busy && (
                <Button variant="ghost" onClick={() => (setDraft(saved), setMessage(null), setShowErrors(false))}>
                  Undo changes
                </Button>
              )}
            </div>
          </form>

          <div className="sig-side">
            <Section title="Preview" storageKey="signature.preview" info="How it looks at the bottom of an email. Mail apps show it on white.">
              <div className="sig-email" aria-label="Signature preview">
                <p className="sig-email-body">Thanks again, and let me know if you have any questions.</p>
                <div className="sig-email-signature" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
              <div className="settings-actions">
                <Button variant="primary" onClick={() => void copy()} disabled={!draft.fullName.trim()}>
                  Copy signature
                </Button>
                <Button
                  onClick={() => downloadFile(`${name}.htm`, signatureHtmlFile(emailHtml, name), "text/html")}
                  disabled={!draft.fullName.trim()}
                >
                  Download for Outlook
                </Button>
              </div>
              {message && (
                <p className={message.tone === "ok" ? "settings-notice" : "settings-error"} role={message.tone === "ok" ? "status" : "alert"}>
                  {message.text}
                </p>
              )}
              {dirty && saved && <p className="settings-help">You have changes that aren't saved yet.</p>}
            </Section>
            <HowToSection />
          </div>
        </div>
      )}
    </ModulePage>
  );
}

function ShowRow({
  label,
  detail,
  value,
  onChange,
  missing,
  note,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  missing?: boolean;
  note?: ReactNode;
}) {
  const empty = missing ?? !detail?.trim();
  return (
    <li>
      <label className="check-row">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>
          {label}
          {empty ? <small>Not in the company profile yet, so it's left out.</small> : detail ? <small>{detail}</small> : null}
          {note}
        </span>
      </label>
    </li>
  );
}

/** Explains whether the logo can show in mail apps yet, and lets an admin fix it. */
function LogoNote({ isAdmin }: { isAdmin: boolean }) {
  const { backend, company, refresh } = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!company.logoDataUrl || company.emailLogoUrl) return null;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const latest = await backend.loadCompany();
      if (!latest.logoDataUrl) return;
      const emailLogoUrl = await backend.publishLogo(latest.logoDataUrl);
      await backend.saveCompany({ ...latest, emailLogoUrl });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <small className="sig-logo-note">
      {isAdmin ? (
        <>
          The logo needs a web address before Gmail and Outlook will show it.{" "}
          <Button size="sm" onClick={() => void publish()} disabled={busy}>
            {busy ? "Getting it ready…" : "Get logo ready for email"}
          </Button>
        </>
      ) : (
        "The logo shows in emails once an admin saves the company profile again."
      )}
      {error && <span className="sig-logo-error"> {error}</span>}
    </small>
  );
}

function HowToSection() {
  return (
    <Section title="Add it to Gmail or Outlook" storageKey="signature.howto" defaultOpen={false} info="Only needed for emails you write outside this app.">
      <div className="sig-howto">
        <h3>Gmail</h3>
        <ol>
          <li>Press Copy signature above.</li>
          <li>In Gmail, open the gear menu, then See all settings.</li>
          <li>On the General tab, scroll to Signature, press Create new, and give it a name.</li>
          <li>Click in the signature box and paste (Ctrl+V, or ⌘V on a Mac).</li>
          <li>Pick it under Signature defaults, then press Save Changes at the bottom.</li>
        </ol>
        <h3>Outlook on the web and new Outlook</h3>
        <ol>
          <li>Press Copy signature above.</li>
          <li>Open Settings, then Accounts, then Signatures, and press New signature.</li>
          <li>Paste into the box, choose it for new messages and replies, and press Save.</li>
        </ol>
        <h3>Classic Outlook on Windows</h3>
        <ol>
          <li>Press Download for Outlook.</li>
          <li>
            Open File Explorer, type <code>%APPDATA%\Microsoft\Signatures</code> in the address bar, and move the downloaded file there.
          </li>
          <li>Restart Outlook, then pick the signature under File, Options, Mail, Signatures.</li>
        </ol>
        <p className="settings-help">
          Company details and the logo come from <Link to="/settings">Settings</Link>. If they change, copy the signature in again.
        </p>
      </div>
    </Section>
  );
}
