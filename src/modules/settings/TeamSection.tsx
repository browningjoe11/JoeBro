import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuthIfAny } from "../../core/auth/AuthProvider";
import { ROLE_LABELS } from "../../core/auth/types";
import { ALL_ROLES, type Role } from "../../core/modules";
import { useSettings, type TeamMember } from "../../core/settings";
import { Badge, Button, DataTable, Section, SelectField, Sheet, TextField, type Column } from "../../ui";

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including Settings.",
  sales: "Customers and tickets from lead to signed.",
  operations: "Customers and tickets from signed to review; scheduling.",
  technician: "Only jobs assigned to them, on their phone.",
  reviewer: "Checks finished work and handles invoices.",
};

function status(m: TeamMember) {
  if (!m.active) return <Badge tone="neutral">Switched off</Badge>;
  if (m.pending) return <Badge tone="warn">Invite sent</Badge>;
  return <Badge tone="good">Active</Badge>;
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <SelectField label="Role" value={value} onChange={(e) => onChange(e.target.value as Role)} hint={ROLE_HELP[value]}>
      {ALL_ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </SelectField>
  );
}

export function TeamSection() {
  const { backend } = useSettings();
  const session = useAuthIfAny()?.session ?? null;
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await backend.loadTeam());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [backend]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<TeamMember>[] = [
    {
      key: "name",
      header: "Name",
      render: (m) => (
        <span className="team-name">
          <strong>{m.fullName || m.email}</strong>
          {m.fullName && m.email && <small>{m.email}</small>}
        </span>
      ),
    },
    { key: "role", header: "Role", render: (m) => ROLE_LABELS[m.role] },
    { key: "status", header: "Status", render: status },
    {
      key: "edit",
      header: "",
      render: (m) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(m)} aria-label={`Edit ${m.fullName || m.email}`}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Section
      title="Team"
      storageKey="settings.team"
      summary={team ? `${team.filter((m) => m.active).length} active` : undefined}
      info="Invite people by email and choose what each person can see. New people get an email with a sign-in link."
      actions={
        <Button size="sm" variant="primary" onClick={() => setInviting(true)}>
          Invite someone
        </Button>
      }
    >
      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}
      {loadError ? (
        <p className="settings-error" role="alert">
          Couldn't load the team: {loadError}
        </p>
      ) : (
        <DataTable columns={columns} rows={team ?? []} rowKey={(m) => m.id} caption="Team members" empty={team ? "No one yet." : "Loading…"} />
      )}

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        onDone={async (email) => {
          setInviting(false);
          setNotice(`Invite sent to ${email}. They can sign in after clicking the link in that email.`);
          await load();
        }}
      />
      <EditSheet
        member={editing}
        isSelf={!!editing && editing.id === session?.userId}
        onClose={() => setEditing(null)}
        onResend={async (m) => {
          await backend.invite({ email: m.email ?? "", fullName: m.fullName, role: m.role });
          setEditing(null);
          setNotice(`Invite sent again to ${m.email}.`);
        }}
        onSaved={async () => {
          setEditing(null);
          setNotice("Saved.");
          await load();
        }}
      />
    </Section>
  );
}

function InviteSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (email: string) => Promise<void> }) {
  const { backend } = useSettings();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("technician");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setFullName("");
      setRole("technician");
      setError(null);
    }
  }, [open]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    try {
      await backend.invite({ email: addr, fullName: fullName.trim(), role });
      await onDone(addr);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite someone"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </>
      }
    >
      <form className="settings-form" onSubmit={submit} noValidate>
        <TextField label="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
          autoComplete="off"
        />
        <RoleSelect value={role} onChange={setRole} />
        <p className="settings-help">Free email allows only a few invites per hour. If one doesn't arrive, wait and use Resend.</p>
      </form>
    </Sheet>
  );
}

function EditSheet({
  member,
  isSelf,
  onClose,
  onSaved,
  onResend,
}: {
  member: TeamMember | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onResend: (m: TeamMember) => Promise<void>;
}) {
  const { backend } = useSettings();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("technician");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setFullName(member.fullName);
      setRole(member.role);
      setActive(member.active);
      setError(null);
    }
  }, [member]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!member}
      onClose={onClose}
      title={member ? `Edit ${member.fullName || member.email}` : "Edit"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              member &&
              void run(async () => {
                await backend.updateMember(member.id, { fullName, role, active });
                await onSaved();
              })
            }
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {member && (
        <div className="settings-form">
          <p className="settings-help">{member.email}</p>
          <TextField label="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <RoleSelect value={role} onChange={setRole} />
          <label className="check-row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={isSelf} />
            <span>
              Account switched on
              <small>{isSelf ? "You can't switch off your own account." : "Switched-off people can't sign in or see anything."}</small>
            </span>
          </label>
          {member.pending && (
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => onResend(member))}>
              Resend invite
            </Button>
          )}
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
