import { useEffect, useId, useState, type FormEvent } from "react";
import { useCurrentUser } from "../../core/currentUser";
import {
  APPLIES_LABELS,
  checkItem,
  KIND_LABELS,
  PRICE_KINDS,
  usePriceBook,
  type AppliesTo,
  type PriceItem,
  type PriceItemInput,
  type PriceKind,
} from "../../core/pricebook";
import { useSettings } from "../../core/settings";
import { Button, SelectField, Sheet, TextAreaField, TextField } from "../../ui";

interface Draft {
  kind: PriceKind;
  name: string;
  description: string;
  trade: string;
  unit: string;
  price: string;
  markupPct: string;
  factor: string;
  appliesTo: AppliesTo | "";
}

const DEFAULT_MARKUP = "20";

function toDraft(item: PriceItem | null, kind: PriceKind): Draft {
  if (!item)
    return {
      kind,
      name: "",
      description: "",
      trade: "",
      unit: KIND_LABELS[kind].units[0] ?? "",
      price: "",
      markupPct: DEFAULT_MARKUP,
      factor: "",
      appliesTo: kind === "multiplier" ? "labor" : "",
    };
  const str = (n: number | null) => (n === null ? "" : String(n));
  return {
    kind: item.kind,
    name: item.name,
    description: item.description,
    trade: item.trade,
    unit: item.unit,
    price: str(item.price),
    markupPct: str(item.markupPct),
    factor: str(item.factor),
    appliesTo: item.appliesTo ?? "",
  };
}

/** "$1,250.50" or "20%" → 1250.5 / 20. Blank → null. */
const parse = (v: string) => {
  const t = v.replace(/[$,%\s]/g, "");
  return t === "" ? null : Number(t);
};

function toInput(d: Draft): PriceItemInput {
  return {
    kind: d.kind,
    name: d.name,
    description: d.description,
    trade: d.trade,
    unit: d.unit,
    price: parse(d.price),
    markupPct: parse(d.markupPct),
    factor: parse(d.factor),
    appliesTo: d.appliesTo || null,
  };
}

interface ItemSheetProps {
  open: boolean;
  /** The item to edit, or null to add a new one. */
  item: PriceItem | null;
  /** Kind for a new item. */
  kind: PriceKind;
  onClose: () => void;
}

/** Add or edit one price book item, or retire it. */
export function ItemSheet({ open, item, kind, onClose }: ItemSheetProps) {
  const { backend, refresh } = usePriceBook();
  const { id: actorId } = useCurrentUser();
  const { choices } = useSettings();
  const [draft, setDraft] = useState<Draft>(() => toDraft(item, kind));
  const [errors, setErrors] = useState<Partial<Record<keyof PriceItemInput, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const unitListId = useId();

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(item, kind));
    setErrors({});
    setFailure(null);
  }, [open, item, kind]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const meta = KIND_LABELS[draft.kind];
  const trades = choices("trade");
  if (draft.trade && !trades.includes(draft.trade)) trades.push(draft.trade);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      await refresh();
      onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const input = toInput(draft);
    const found = checkItem(input);
    setErrors(found);
    if (Object.keys(found).length) return;
    void run(() => (item ? backend.update(item.id, input, actorId) : backend.create(input, actorId)));
  }

  const title = item ? `Edit ${item.name}` : `Add a ${meta.singular}`;
  const isMult = draft.kind === "multiplier";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {item && (
            <Button
              variant={item.active ? "danger" : "secondary"}
              className="sheet-foot-left"
              disabled={busy}
              onClick={() => void run(() => backend.update(item.id, { active: !item.active }, actorId))}
            >
              {item.active ? "Retire" : "Bring back"}
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            {busy ? "Saving…" : item ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-stack" onSubmit={save} noValidate>
        {item && !item.active && <p className="pb-note">This item is retired: it stays on old estimates but can't be picked for new ones.</p>}
        {!item && (
          <SelectField
            label="Kind"
            value={draft.kind}
            onChange={(e) => setDraft(toDraft(null, e.target.value as PriceKind))}
            info="Labor rates are charged per hour, materials at your cost plus markup, adders as extra charges, and multipliers scale part of the estimate."
          >
            {PRICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k].title}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="Name" value={draft.name} error={errors.name} onChange={(e) => set("name", e.target.value)} autoFocus={!item} />
        <TextAreaField
          label="Description"
          hint="Optional. Shown when picking the item."
          rows={2}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <SelectField
          label="Trade"
          value={draft.trade}
          onChange={(e) => set("trade", e.target.value)}
          info="Pick a trade to offer this item only on estimates for that trade. Any trade shows it everywhere. Edit the list in Settings."
        >
          <option value="">Any trade</option>
          {trades.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>
        {isMult ? (
          <div className="form-grid">
            <TextField
              label="Factor"
              inputMode="decimal"
              prefix="×"
              value={draft.factor}
              error={errors.factor}
              hint={factorHint(parse(draft.factor))}
              onChange={(e) => set("factor", e.target.value)}
              info="1.15 adds 15%. 1.5 adds half again. 0.9 takes 10% off."
            />
            <SelectField label="Applies to" value={draft.appliesTo} error={errors.appliesTo} onChange={(e) => set("appliesTo", e.target.value as AppliesTo)}>
              {(Object.keys(APPLIES_LABELS) as AppliesTo[]).map((a) => (
                <option key={a} value={a}>
                  {APPLIES_LABELS[a]}
                </option>
              ))}
            </SelectField>
          </div>
        ) : (
          <div className="form-grid">
            <TextField
              label={meta.priceLabel}
              inputMode="decimal"
              prefix="$"
              value={draft.price}
              error={errors.price}
              onChange={(e) => set("price", e.target.value)}
              info={draft.kind === "material" ? "What you pay per unit, before markup." : undefined}
            />
            <TextField
              label="Unit"
              list={unitListId}
              value={draft.unit}
              error={errors.unit}
              hint={draft.kind === "adder" ? "Use job for a flat fee." : undefined}
              onChange={(e) => set("unit", e.target.value)}
            />
            <datalist id={unitListId}>
              {meta.units.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            {draft.kind === "material" && (
              <TextField
                label="Markup"
                inputMode="decimal"
                suffix="%"
                value={draft.markupPct}
                error={errors.markupPct}
                onChange={(e) => set("markupPct", e.target.value)}
                info="Added on top of your cost when the material goes on an estimate. It can still be changed on each estimate."
              />
            )}
          </div>
        )}
        {failure && (
          <p className="settings-error" role="alert">
            {failure}
          </p>
        )}
      </form>
    </Sheet>
  );
}

function factorHint(f: number | null): string | undefined {
  if (f === null || !Number.isFinite(f) || f <= 0) return undefined;
  const pct = Math.round((f - 1) * 1000) / 10;
  if (pct === 0) return "No change.";
  return pct > 0 ? `Adds ${pct}%.` : `Takes ${-pct}% off.`;
}
