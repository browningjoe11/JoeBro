import { useState, type FormEvent } from "react";
import { LIST_LABELS, useSettings, type ListItem, type ListName } from "../../core/settings";
import { Badge, Button, Section, TextField } from "../../ui";

export function ListsSection() {
  return (
    <>
      {(Object.keys(LIST_LABELS) as ListName[]).map((list) => (
        <OptionList key={list} list={list} />
      ))}
    </>
  );
}

function OptionList({ list }: { list: ListName }) {
  const { backend, lists, refresh } = useSettings();
  const meta = LIST_LABELS[list];
  const items = lists.filter((l) => l.list === list);
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const text = label.trim();
    if (!text) return;
    const sort = items.reduce((max, i) => Math.max(max, i.sort), 0) + 10;
    await run("new", async () => {
      await backend.addListItem(list, text, sort);
      setLabel("");
    });
  }

  /** Swap this choice with its neighbour. */
  function move(item: ListItem, dir: -1 | 1) {
    const i = items.indexOf(item);
    const other = items[i + dir];
    if (!other) return;
    void run(item.id, async () => {
      await backend.updateListItem(item.id, { sort: other.sort });
      await backend.updateListItem(other.id, { sort: item.sort === other.sort ? item.sort + dir : item.sort });
    });
  }

  return (
    <Section
      title={meta.title}
      storageKey={`settings.list.${list}`}
      defaultOpen={false}
      summary={`${items.filter((i) => i.active).length} choices`}
      info={`${meta.info} Hiding a choice keeps it on old records but stops it showing for new ones.`}
    >
      <ul className="option-list" aria-label={meta.title}>
        {items.map((item, i) => (
          <li key={item.id} className={item.active ? undefined : "option-hidden"}>
            <span className="option-label">
              {item.label} {!item.active && <Badge>Hidden</Badge>}
            </span>
            <span className="option-actions">
              <Button size="sm" variant="ghost" aria-label={`Move ${item.label} up`} disabled={i === 0 || !!busyId} onClick={() => move(item, -1)}>
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move ${item.label} down`}
                disabled={i === items.length - 1 || !!busyId}
                onClick={() => move(item, 1)}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busyId}
                onClick={() => void run(item.id, () => backend.updateListItem(item.id, { active: !item.active }))}
              >
                {item.active ? `Hide ${item.label}` : `Show ${item.label}`}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <form className="option-add" onSubmit={add}>
        <TextField label={`Add a ${meta.singular}`} value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" disabled={!label.trim() || busyId === "new"}>
          Add
        </Button>
      </form>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </Section>
  );
}
