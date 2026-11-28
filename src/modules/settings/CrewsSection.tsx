import { useEffect, useState, type FormEvent } from "react";
import type { EventColor } from "../../core/calendar";
import {
  checkCrew,
  checkTechnician,
  ColorPicker,
  CrewChip,
  formatDays,
  formatHours,
  NEW_CREW,
  NEW_TECHNICIAN,
  nextFreeColor,
  useCrews,
  WEEKDAY_ORDER,
  WEEKDAYS,
  type Crew,
  type CrewInput,
  type Technician,
  type TechnicianInput,
} from "../../core/crews";
import { useSettings, type TeamMember } from "../../core/settings";
import { Badge, Button, CheckChips, DataTable, Section, SelectField, Sheet, TextAreaField, TextField, type Column } from "../../ui";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Trades from Settings, plus any old skill a crew or tech still has after the trade was hidden. */
function useSkillOptions(current: string[]) {
  const { choices } = useSettings();
  const trades = choices("trade");
  return [...trades, ...current.filter((s) => !trades.includes(s))].map((s) => ({ value: s, label: s }));
}

const DAY_OPTIONS = WEEKDAY_ORDER.map((d) => ({ value: String(d), label: WEEKDAYS[d] }));

const skillsText = (skills: string[]) => (skills.length ? skills.join(", ") : <span className="muted">None set</span>);

// ---------------------------------------------------------------------------
// Crews
// ---------------------------------------------------------------------------

export function CrewsSection() {
  const { crews, technicians, error, loading } = useCrews();
  const [editing, setEditing] = useState<Crew | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const techsOn = (crewId: string) => technicians.filter((t) => t.active && t.crewId === crewId);

  const columns: Column<Crew>[] = [
    { key: "crew", header: "Crew", render: (c) => <CrewChip name={c.name} color={c.color} retired={!c.active} /> },
    { key: "skills", header: "Skills", render: (c) => skillsText(c.skills) },
    {
      key: "hours",
      header: "Works",
      render: (c) => (
        <span className="team-name">
          <span>{formatDays(c.workDays)}</span>
          <small>{formatHours(c.dayStart, c.dayEnd)}</small>
        </span>
      ),
    },
    {
      key: "techs",
      header: "Techs",
      render: (c) => {
        const on = techsOn(c.id);
        return on.length ? on.map((t) => t.fullName).join(", ") : <span className="muted">Nobody yet</span>;
      },
    },
    {
      key: "edit",
      header: "",
      render: (c) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
          Edit
        </Button>
      ),
    },
  ];

  const active = crews.filter((c) => c.active).length;

  return (
    <Section
      title="Crews"
      storageKey="settings.crews"
      summary={loading ? undefined : `${active} active`}
      info="Each crew gets one color. Its bookings on the calendar, and later its lane on the scheduling board and its pins on the map, use that color. Working days and hours are the crew's normal week; techs on the crew work the same hours."
      actions={
        <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
          Add crew
        </Button>
      }
    >
      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}
      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load crews: {error}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={crews}
          rowKey={(c) => c.id}
          caption="Crews"
          empty={loading ? "Loading…" : "No crews yet. Add one to give its jobs a color on the calendar."}
        />
      )}
      <CrewSheet
        crew={editing}
        onClose={() => setEditing(null)}
        onSaved={(name, isNew) => {
          setEditing(null);
          setNotice(isNew ? `${name} added.` : `${name} saved.`);
        }}
      />
    </Section>
  );
}

function CrewSheet({ crew, onClose, onSaved }: { crew: Crew | "new" | null; onClose: () => void; onSaved: (name: string, isNew: boolean) => void }) {
  const { backend, crews, refresh } = useCrews();
  const [draft, setDraft] = useState<CrewInput>(NEW_CREW);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = crew && crew !== "new" ? crew : null;
  const skillOptions = useSkillOptions(draft.skills);

  useEffect(() => {
    if (!crew) return;
    setDraft(crew === "new" ? { ...NEW_CREW, color: nextFreeColor(crews) } : { ...crew });
    setError(null);
    setBusy(false);
    // Only when a different crew opens, not when the list reloads.
  }, [crew]);

  if (!crew) return null;
  const set = <K extends keyof CrewInput>(key: K, value: CrewInput[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const taken: Partial<Record<EventColor, string>> = {};
  for (const c of crews) if (c.active && c.id !== existing?.id && !taken[c.color]) taken[c.color] = c.name;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const msg = checkCrew(draft, crews, existing?.id);
    if (msg) return setError(msg);
    setBusy(true);
    setError(null);
    try {
      if (existing) await backend.updateCrew(existing.id, draft);
      else await backend.createCrew(draft);
      await refresh();
      onSaved(draft.name.trim(), !existing);
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  const formId = "crew-form";
  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : "Add crew"}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            {busy ? "Saving…" : existing ? "Save crew" : "Add crew"}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit} noValidate>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <TextField label="Crew name" value={draft.name} onChange={(e) => set("name", e.target.value)} autoFocus={!existing} placeholder="Deck crew" />
        <ColorPicker label="Color" value={draft.color} onChange={(c) => set("color", c)} taken={taken} />
        <p className="crew-preview">
          Looks like: <CrewChip name={draft.name.trim() || "New crew"} color={draft.color} />
        </p>
        <CheckChips
          label="Skills"
          options={skillOptions}
          value={draft.skills}
          onChange={(v) => set("skills", v)}
          info="The kinds of work this crew does. The list comes from Trades, further down in Settings."
        />
        <CheckChips
          label="Working days"
          options={DAY_OPTIONS}
          value={draft.workDays.map(String)}
          onChange={(v) => set("workDays", v.map(Number))}
        />
        <div className="cal-form-pair">
          <TextField label="Day starts" type="time" step={900} value={draft.dayStart} onChange={(e) => set("dayStart", e.target.value)} />
          <TextField label="Day ends" type="time" step={900} value={draft.dayEnd} onChange={(e) => set("dayEnd", e.target.value)} />
        </div>
        <TextAreaField label="Notes" rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} hint="Optional. Truck, trailer, anything the scheduler should know." />
        {existing && (
          <label className="check-row">
            <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
            <span>
              Active
              <small>Untick to retire the crew. Its old bookings keep their color; it stops showing for new ones.</small>
            </span>
          </label>
        )}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Technicians
// ---------------------------------------------------------------------------

export function TechniciansSection() {
  const { technicians, crewById, error, loading } = useCrews();
  const { backend } = useSettings();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [editing, setEditing] = useState<Technician | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    backend
      .loadTeam()
      .then(setTeam)
      .catch(() => {});
  }, [backend]);

  const loginName = (id: string | null) => {
    if (!id) return null;
    const m = team.find((x) => x.id === id);
    return m ? m.fullName || m.email : "Linked";
  };

  const columns: Column<Technician>[] = [
    {
      key: "name",
      header: "Name",
      render: (t) => (
        <span className="team-name">
          <strong>
            {t.fullName} {!t.active && <Badge>Retired</Badge>}
          </strong>
          {t.phone && <small>{t.phone}</small>}
        </span>
      ),
    },
    {
      key: "crew",
      header: "Crew",
      render: (t) => {
        const c = crewById(t.crewId);
        return c ? <CrewChip name={c.name} color={c.color} retired={!c.active} /> : <span className="muted">No crew</span>;
      },
    },
    { key: "skills", header: "Skills", render: (t) => skillsText(t.skills) },
    { key: "login", header: "App login", render: (t) => loginName(t.profileId) ?? <span className="muted">None</span> },
    {
      key: "edit",
      header: "",
      render: (t) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.fullName}`}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Section
      title="Technicians"
      storageKey="settings.technicians"
      summary={loading ? undefined : `${technicians.filter((t) => t.active).length} active`}
      info="The people in the field. Put each on a crew so they share its color and hours. Link a tech to their app login once they've been invited under Team, so their jobs show on their phone."
      actions={
        <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
          Add technician
        </Button>
      }
    >
      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}
      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load technicians: {error}
        </p>
      ) : (
        <DataTable columns={columns} rows={technicians} rowKey={(t) => t.id} caption="Technicians" empty={loading ? "Loading…" : "No technicians yet."} />
      )}
      <TechnicianSheet
        tech={editing}
        team={team}
        onClose={() => setEditing(null)}
        onSaved={(name, isNew) => {
          setEditing(null);
          setNotice(isNew ? `${name} added.` : `${name} saved.`);
        }}
      />
    </Section>
  );
}

function TechnicianSheet({
  tech,
  team,
  onClose,
  onSaved,
}: {
  tech: Technician | "new" | null;
  team: TeamMember[];
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => void;
}) {
  const { backend, crews, technicians, crewById, refresh } = useCrews();
  const [draft, setDraft] = useState<TechnicianInput>(NEW_TECHNICIAN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = tech && tech !== "new" ? tech : null;
  const skillOptions = useSkillOptions(draft.skills);

  useEffect(() => {
    if (!tech) return;
    setDraft(tech === "new" ? NEW_TECHNICIAN : { ...tech });
    setError(null);
    setBusy(false);
  }, [tech]);

  if (!tech) return null;
  const set = <K extends keyof TechnicianInput>(key: K, value: TechnicianInput[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Active crews, plus the tech's current one if it has been retired since.
  const crewOptions = crews.filter((c) => c.active || c.id === draft.crewId);
  // Logins nobody else has claimed.
  const linked = new Set(technicians.filter((t) => t.id !== existing?.id && t.profileId).map((t) => t.profileId));
  const loginOptions = team.filter((m) => (m.active && !linked.has(m.id)) || m.id === draft.profileId);
  const crew = crewById(draft.crewId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const msg = checkTechnician(draft);
    if (msg) return setError(msg);
    setBusy(true);
    setError(null);
    try {
      if (existing) await backend.updateTechnician(existing.id, draft);
      else await backend.createTechnician(draft);
      await refresh();
      onSaved(draft.fullName.trim(), !existing);
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  const formId = "technician-form";
  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? `Edit ${existing.fullName}` : "Add technician"}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            {busy ? "Saving…" : existing ? "Save technician" : "Add technician"}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit} noValidate>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <TextField label="Name" value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} autoFocus={!existing} />
        <div className="cal-form-pair">
          <TextField label="Phone" type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
          <TextField label="Email" type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} hint="Optional." />
        </div>
        <SelectField
          label="Crew"
          value={draft.crewId ?? ""}
          onChange={(e) => set("crewId", e.target.value || null)}
          hint={crew ? `Works ${formatDays(crew.workDays)}, ${formatHours(crew.dayStart, crew.dayEnd)}.` : "Not on a crew. Can still be booked on their own."}
        >
          <option value="">No crew</option>
          {crewOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (retired)"}
            </option>
          ))}
        </SelectField>
        {crew && (
          <p className="crew-preview">
            Shows as <CrewChip name={crew.name} color={crew.color} />
          </p>
        )}
        <CheckChips label="Skills" options={skillOptions} value={draft.skills} onChange={(v) => set("skills", v)} />
        <SelectField
          label="App login"
          value={draft.profileId ?? ""}
          onChange={(e) => set("profileId", e.target.value || null)}
          info="Invite the tech under Team first. Linking their login here lets their phone show their crew's jobs."
        >
          <option value="">No login yet</option>
          {loginOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName || m.email}
            </option>
          ))}
        </SelectField>
        <TextAreaField label="Notes" rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        {existing && (
          <label className="check-row">
            <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
            <span>
              Active
              <small>Untick when someone leaves. They stay on old jobs.</small>
            </span>
          </label>
        )}
      </form>
    </Sheet>
  );
}
