import { useState, type ReactNode } from "react";
import {
  lineFromItem,
  newLineId,
  type AdderLine,
  type EstimateInput,
  type EstimateResult,
  type Issue,
  type LaborLine,
  type MaterialLine,
  type MultiplierLine,
} from "../../core/estimate";
import { APPLIES_LABELS, PriceItemPicker, type AppliesTo, type PriceItem, type PriceKind } from "../../core/pricebook";
import { Button, Section } from "../../ui";
import { NumInput } from "./NumInput";
import { formatMoney, formatSigned } from "./format";

export type LineKey = "labor" | "materials" | "adders" | "multipliers";
type LineOf = { labor: LaborLine; materials: MaterialLine; adders: AdderLine; multipliers: MultiplierLine };

export interface LinesApi {
  lines: EstimateInput;
  result: EstimateResult;
  /** Ticket trade, offered as a filter in the price book search. */
  trade: string;
  update: <K extends LineKey>(key: K, id: string, patch: Partial<LineOf[K]>) => void;
  add: <K extends LineKey>(key: K, line: LineOf[K]) => void;
  remove: (key: LineKey, id: string) => void;
}

const nameOf = (l: { name: string }) => l.name.trim() || "new line";

/** The row's problems, worded by the math engine. */
function Problems({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <p className="est-line-issue" role="alert">
      {issues.map((i) => i.message).join(" ")}
    </p>
  );
}

function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`est-cell${className ? ` ${className}` : ""}`}>
      <span className="est-cell-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

function NameInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input className="est-name" aria-label={label} placeholder="What it is" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="est-remove" aria-label={`Remove ${name}`} onClick={onClick}>
      Remove
    </Button>
  );
}

/** "Add from price book" and "Add a blank line", with the search under them when open. */
function AddBar({ kind, what, trade, onPick, onBlank }: { kind: PriceKind; what: string; trade: string; onPick: (item: PriceItem) => void; onBlank: () => void }) {
  const [open, setOpen] = useState(false);
  const [onlyTrade, setOnlyTrade] = useState(false);
  return (
    <div className="est-add">
      <div className="est-add-buttons">
        <Button size="sm" variant={open ? "secondary" : "primary"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Close price book" : `Add ${what} from price book`}
        </Button>
        <Button size="sm" variant="ghost" onClick={onBlank}>
          Add a blank line
        </Button>
      </div>
      {open && (
        <div className="est-picker">
          <PriceItemPicker kind={kind} trade={onlyTrade ? trade : undefined} onPick={onPick} />
          {trade && (
            <label className="est-check">
              <input type="checkbox" checked={onlyTrade} onChange={(e) => setOnlyTrade(e.target.checked)} /> Only {trade} items
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function issuesFor(result: EstimateResult, id: string) {
  return result.issues.filter((i) => i.id === id);
}
const bad = (issues: Issue[], field: Issue["field"]) => issues.some((i) => i.field === field);

function useAddFromBook<K extends LineKey>(api: LinesApi, key: K) {
  return (item: PriceItem) => {
    const made = lineFromItem(item, newLineId());
    if (made.section === key) api.add(key, made.line as LineOf[K]);
  };
}

export function TimeSection({ api }: { api: LinesApi }) {
  const { lines, result } = api;
  const pick = useAddFromBook(api, "labor");
  const adjusted = result.laborTotal - result.laborSubtotal;
  return (
    <Section
      title="Time"
      storageKey="estimate.time"
      summary={formatMoney(result.laborTotal)}
      info="Labor for the job: hours (or days) for each kind of worker times their rate. Pick a rate from the price book, then type the hours. Multipliers for labor, like difficult access, are added in the Multipliers section."
    >
      {lines.labor.length > 0 && (
        <div className="est-lines est-lines--labor" role="list" aria-label="Time lines">
          <div className="est-head" aria-hidden="true">
            <span>Worker</span>
            <span>Hours / days</span>
            <span>Per</span>
            <span>Rate</span>
            <span className="num">Amount</span>
            <span />
          </div>
          {lines.labor.map((l, i) => {
            const iss = issuesFor(result, l.id);
            const n = nameOf(l);
            return (
              <div className="est-line" role="listitem" key={l.id}>
                <Cell label="Worker" className="est-cell--name">
                  <NameInput label={`Worker for time line ${i + 1}`} value={l.name} onChange={(name) => api.update("labor", l.id, { name })} />
                </Cell>
                <Cell label={l.unit === "day" ? "Days" : "Hours"}>
                  <NumInput label={`${l.unit === "day" ? "Days" : "Hours"} for ${n}`} value={l.quantity} invalid={bad(iss, "quantity")} onChange={(quantity) => api.update("labor", l.id, { quantity })} />
                </Cell>
                <Cell label="Per">
                  <select aria-label={`Rate per for ${n}`} value={l.unit === "day" ? "day" : "hr"} onChange={(e) => api.update("labor", l.id, { unit: e.target.value })}>
                    <option value="hr">hour</option>
                    <option value="day">day</option>
                  </select>
                </Cell>
                <Cell label="Rate">
                  <NumInput label={`Rate for ${n}`} prefix="$" value={l.rate} invalid={bad(iss, "rate")} onChange={(rate) => api.update("labor", l.id, { rate })} />
                </Cell>
                <Cell label="Amount" className="est-amount">
                  <output aria-label={`Amount for ${n}`}>{formatMoney(result.labor[i]?.amount ?? 0)}</output>
                </Cell>
                <RemoveButton name={n} onClick={() => api.remove("labor", l.id)} />
                <Problems issues={iss} />
              </div>
            );
          })}
        </div>
      )}
      {lines.labor.length === 0 && <p className="est-empty">No time yet. Add a labor rate from the price book.</p>}
      {adjusted !== 0 && (
        <p className="est-note">
          Labor {formatMoney(result.laborSubtotal)} {formatSigned(adjusted)} from multipliers = {formatMoney(result.laborTotal)}
        </p>
      )}
      <AddBar kind="labor" what="a labor rate" trade={api.trade} onPick={pick} onBlank={() => api.add("labor", { id: newLineId(), name: "", unit: "hr", quantity: 1, rate: 0 })} />
    </Section>
  );
}

export function MaterialsSection({ api }: { api: LinesApi }) {
  const { lines, result } = api;
  const pick = useAddFromBook(api, "materials");
  const adjusted = result.materialsTotal - result.materialsSubtotal;
  return (
    <Section
      title="Materials"
      storageKey="estimate.materials"
      summary={formatMoney(result.materialsTotal)}
      info="Things you buy for the job. Enter the quantity and your cost per unit; the markup is added on top for the customer's price. The price book fills in your cost and usual markup, and you can change them here for this estimate only."
    >
      {lines.materials.length > 0 && (
        <div className="est-lines est-lines--materials" role="list" aria-label="Material lines">
          <div className="est-head" aria-hidden="true">
            <span>Material</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Your cost</span>
            <span>Markup</span>
            <span className="num">Amount</span>
            <span />
          </div>
          {lines.materials.map((m, i) => {
            const iss = issuesFor(result, m.id);
            const n = nameOf(m);
            return (
              <div className="est-line" role="listitem" key={m.id}>
                <Cell label="Material" className="est-cell--name">
                  <NameInput label={`Material for line ${i + 1}`} value={m.name} onChange={(name) => api.update("materials", m.id, { name })} />
                </Cell>
                <Cell label="Qty">
                  <NumInput label={`Quantity of ${n}`} value={m.quantity} invalid={bad(iss, "quantity")} onChange={(quantity) => api.update("materials", m.id, { quantity })} />
                </Cell>
                <Cell label="Unit">
                  <input className="est-unit" aria-label={`Unit for ${n}`} value={m.unit} onChange={(e) => api.update("materials", m.id, { unit: e.target.value })} />
                </Cell>
                <Cell label="Your cost">
                  <NumInput label={`Your cost for ${n}`} prefix="$" value={m.unitCost} invalid={bad(iss, "unitCost")} onChange={(unitCost) => api.update("materials", m.id, { unitCost })} />
                </Cell>
                <Cell label="Markup">
                  <NumInput label={`Markup for ${n}`} suffix="%" value={m.markupPct} invalid={bad(iss, "markupPct")} onChange={(markupPct) => api.update("materials", m.id, { markupPct })} />
                </Cell>
                <Cell label="Amount" className="est-amount">
                  <output aria-label={`Amount for ${n}`}>{formatMoney(result.materials[i]?.amount ?? 0)}</output>
                </Cell>
                <RemoveButton name={n} onClick={() => api.remove("materials", m.id)} />
                <Problems issues={iss} />
              </div>
            );
          })}
        </div>
      )}
      {lines.materials.length === 0 && <p className="est-empty">No materials yet.</p>}
      {lines.materials.length > 0 && (
        <p className="est-note">
          Your cost {formatMoney(result.materialsCost)} + markup {formatMoney(result.materialsMarkup)}
          {adjusted !== 0 && ` ${formatSigned(adjusted)} from multipliers`} = {formatMoney(result.materialsTotal)}
        </p>
      )}
      <AddBar kind="material" what="a material" trade={api.trade} onPick={pick} onBlank={() => api.add("materials", { id: newLineId(), name: "", unit: "ea", quantity: 1, unitCost: 0, markupPct: 0 })} />
    </Section>
  );
}

export function AddersSection({ api }: { api: LinesApi }) {
  const { lines, result } = api;
  const pick = useAddFromBook(api, "adders");
  return (
    <Section
      title="Adders"
      storageKey="estimate.adders"
      summary={formatMoney(result.addersTotal)}
      info="Extra charges that aren't labor or materials: permits, dumpster loads, travel. A flat fee is quantity 1 of a “job”; a per-unit charge like a dump load is the number of loads times the charge."
    >
      {lines.adders.length > 0 && (
        <div className="est-lines est-lines--adders" role="list" aria-label="Adder lines">
          <div className="est-head" aria-hidden="true">
            <span>Charge</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Price</span>
            <span className="num">Amount</span>
            <span />
          </div>
          {lines.adders.map((a, i) => {
            const iss = issuesFor(result, a.id);
            const n = nameOf(a);
            return (
              <div className="est-line" role="listitem" key={a.id}>
                <Cell label="Charge" className="est-cell--name">
                  <NameInput label={`Charge for adder line ${i + 1}`} value={a.name} onChange={(name) => api.update("adders", a.id, { name })} />
                </Cell>
                <Cell label="Qty">
                  <NumInput label={`Quantity of ${n}`} value={a.quantity} invalid={bad(iss, "quantity")} onChange={(quantity) => api.update("adders", a.id, { quantity })} />
                </Cell>
                <Cell label="Unit">
                  <input className="est-unit" aria-label={`Unit for ${n}`} value={a.unit} onChange={(e) => api.update("adders", a.id, { unit: e.target.value })} />
                </Cell>
                <Cell label="Price">
                  <NumInput label={`Price for ${n}`} prefix="$" value={a.price} invalid={bad(iss, "price")} onChange={(price) => api.update("adders", a.id, { price })} />
                </Cell>
                <Cell label="Amount" className="est-amount">
                  <output aria-label={`Amount for ${n}`}>{formatMoney(result.adders[i]?.amount ?? 0)}</output>
                </Cell>
                <RemoveButton name={n} onClick={() => api.remove("adders", a.id)} />
                <Problems issues={iss} />
              </div>
            );
          })}
        </div>
      )}
      {lines.adders.length === 0 && <p className="est-empty">No adders yet.</p>}
      <AddBar kind="adder" what="an adder" trade={api.trade} onPick={pick} onBlank={() => api.add("adders", { id: newLineId(), name: "", unit: "job", quantity: 1, price: 0 })} />
    </Section>
  );
}

export function MultipliersSection({ api }: { api: LinesApi }) {
  const { lines, result } = api;
  const pick = useAddFromBook(api, "multipliers");
  const added = result.multipliers.reduce((s, m) => s + m.amount, 0);
  return (
    <Section
      title="Multipliers"
      storageKey="estimate.multipliers"
      summary={lines.multipliers.length ? formatSigned(Math.round(added * 100) / 100) : formatMoney(0)}
      info="Adjustments for harder or rushed jobs. A factor of 1.15 adds 15% to the part it applies to (labor, materials or the whole estimate); 0.9 takes 10% off. Several multipliers on the same part are applied one after another."
    >
      {lines.multipliers.length > 0 && (
        <div className="est-lines est-lines--multipliers" role="list" aria-label="Multiplier lines">
          <div className="est-head" aria-hidden="true">
            <span>Adjustment</span>
            <span>Factor</span>
            <span>Applies to</span>
            <span className="num">Adds</span>
            <span />
          </div>
          {lines.multipliers.map((m, i) => {
            const iss = issuesFor(result, m.id);
            const n = nameOf(m);
            return (
              <div className="est-line" role="listitem" key={m.id}>
                <Cell label="Adjustment" className="est-cell--name">
                  <NameInput label={`Adjustment for multiplier line ${i + 1}`} value={m.name} onChange={(name) => api.update("multipliers", m.id, { name })} />
                </Cell>
                <Cell label="Factor">
                  <NumInput label={`Factor for ${n}`} prefix="×" value={m.factor} invalid={bad(iss, "factor")} onChange={(factor) => api.update("multipliers", m.id, { factor })} />
                </Cell>
                <Cell label="Applies to">
                  <select aria-label={`What ${n} applies to`} value={m.appliesTo} onChange={(e) => api.update("multipliers", m.id, { appliesTo: e.target.value as AppliesTo })}>
                    {(Object.keys(APPLIES_LABELS) as AppliesTo[]).map((k) => (
                      <option key={k} value={k}>
                        {APPLIES_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </Cell>
                <Cell label="Adds" className="est-amount">
                  <output aria-label={`Amount for ${n}`}>{formatSigned(result.multipliers[i]?.amount ?? 0)}</output>
                </Cell>
                <RemoveButton name={n} onClick={() => api.remove("multipliers", m.id)} />
                <Problems issues={iss} />
              </div>
            );
          })}
        </div>
      )}
      {lines.multipliers.length === 0 && <p className="est-empty">No multipliers. Most estimates don't need one.</p>}
      <AddBar
        kind="multiplier"
        what="a multiplier"
        trade={api.trade}
        onPick={pick}
        onBlank={() => api.add("multipliers", { id: newLineId(), name: "", factor: 1.1, appliesTo: "total" })}
      />
    </Section>
  );
}
