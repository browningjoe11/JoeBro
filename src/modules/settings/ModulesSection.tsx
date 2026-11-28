import { useEffect, useState } from "react";
import { Icon } from "../../core/Icon";
import { CORE_MODULES, useSettings } from "../../core/settings";
import { Button, Section } from "../../ui";

export function ModulesSection() {
  const { backend, catalog, company, refresh } = useSettings();
  const [off, setOff] = useState<Set<string>>(new Set(company.disabledModules));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => setOff(new Set(company.disabledModules)), [company.disabledModules]);

  const switchable = catalog.filter((m) => !CORE_MODULES.has(m.id)).slice().sort((a, b) => a.order - b.order);
  const dirty = [...off].sort().join() !== [...company.disabledModules].sort().join();

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const latest = await backend.loadCompany();
      await backend.saveCompany({ ...latest, disabledModules: [...off].sort() });
      await refresh();
      setMessage({ tone: "ok", text: "Saved. The menu now shows only the modules that are on." });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Modules"
      storageKey="settings.modules"
      summary={`${switchable.length - off.size} of ${switchable.length} on`}
      info="Switch off parts of the app you aren't using yet. They disappear from everyone's menu. Nothing is deleted; switch them back on any time. Dashboard and Settings are always on."
    >
      <ul className="module-switches">
        {switchable.map((m) => {
          const isOn = !off.has(m.id);
          return (
            <li key={m.id}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={(e) => {
                    const next = new Set(off);
                    if (e.target.checked) next.delete(m.id);
                    else next.add(m.id);
                    setOff(next);
                  }}
                />
                <Icon name={m.icon} />
                <span>
                  {m.label}
                  <small>{m.description}</small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="settings-actions">
        <Button variant="primary" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save modules"}
        </Button>
        {message && (
          <p className={message.tone === "ok" ? "settings-notice" : "settings-error"} role={message.tone === "ok" ? "status" : "alert"}>
            {message.text}
          </p>
        )}
      </div>
    </Section>
  );
}
