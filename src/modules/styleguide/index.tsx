import { useState } from "react";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";
import { Badge, Button, DataTable, InfoTip, Section, SelectField, Sheet, TextAreaField, TextField, type Column, type Tone } from "../../ui";

const SWATCHES = [
  ["--brand", "Brand teal", "Main actions, active menu item"],
  ["--hivis", "Hi-vis yellow", "Things that need attention"],
  ["--ink", "Ink", "Body text"],
  ["--muted", "Muted", "Labels and help text"],
  ["--surface", "Surface", "Cards and panels"],
  ["--bg", "Background", "Page behind cards"],
  ["--good", "Good", "Done, paid, approved"],
  ["--warn", "Warning", "Due soon, soft scheduled"],
  ["--bad", "Problem", "Overdue, failed, lost"],
  ["--info", "Info", "Neutral notices"],
] as const;

const STAGES: [string, Tone][] = [
  ["Lead", "neutral"],
  ["Site visit", "info"],
  ["Estimate sent", "brand"],
  ["Signed", "good"],
  ["Soft scheduled", "warn"],
  ["Review", "info"],
  ["Overdue", "bad"],
  ["Paid", "good"],
];

interface MaterialRow {
  id: string;
  item: string;
  qty: number;
  unit: string;
  cost: number;
}

/** Example rows for the style guide only. */
const EXAMPLE_MATERIALS: MaterialRow[] = [
  { id: "1", item: "Pressure-treated 2×6×12", qty: 18, unit: "ea", cost: 14.98 },
  { id: "2", item: "Composite decking board 16 ft", qty: 42, unit: "ea", cost: 38.5 },
  { id: "3", item: "Structural screws, 5 lb box", qty: 3, unit: "box", cost: 46.0 },
  { id: "4", item: "Concrete mix, 80 lb", qty: 12, unit: "bag", cost: 6.75 },
];

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const MATERIAL_COLUMNS: Column<MaterialRow>[] = [
  { key: "item", header: "Item", render: (r) => r.item },
  { key: "qty", header: "Qty", numeric: true, render: (r) => `${r.qty} ${r.unit}` },
  { key: "cost", header: "Unit cost", numeric: true, render: (r) => money(r.cost) },
  { key: "total", header: "Line total", numeric: true, render: (r) => money(r.qty * r.cost) },
];

function StyleGuidePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const materialsTotal = EXAMPLE_MATERIALS.reduce((sum, r) => sum + r.qty * r.cost, 0);

  return (
    <ModulePage title="Style guide" description="Every building block the app uses, in one place. Examples below are sample data.">
      <Section title="Colors" storageKey="styleguide.colors" info="Every color comes from one token list, so light and dark themes always match. Switch Theme in the top bar to compare.">
        <div className="sg-swatches">
          {SWATCHES.map(([token, name, use]) => (
            <div className="sg-swatch" key={token}>
              <span className="sg-chip" style={{ background: `var(${token})` }} />
              <div>
                <strong>{name}</strong>
                <p className="muted">{use}</p>
                <code className="mono">{token}</code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type" storageKey="styleguide.type">
        <div className="stack">
          <p className="sg-display">Barlow Condensed for headings</p>
          <p className="sg-body">Barlow for body text. Sized at 16 pixels so it reads comfortably on a PC monitor and a phone.</p>
          <p className="mono">IBM Plex Mono for money and quantities: $12,480.00 · 36.5 hrs</p>
        </div>
      </Section>

      <Section title="Buttons" storageKey="styleguide.buttons" info="Use one primary button per screen for the main action, like Send estimate.">
        <div className="row">
          <Button variant="primary" icon={<Icon name="plus" size={18} />}>
            New ticket
          </Button>
          <Button>Save draft</Button>
          <Button variant="ghost">Preview</Button>
          <Button variant="danger">Mark lost</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="row" style={{ marginTop: "var(--sp-3)" }}>
          <Button size="sm">Small</Button>
          <Button variant="primary" size="lg">
            Large (onsite phones)
          </Button>
        </div>
      </Section>

      <Section title="Form fields" storageKey="styleguide.fields" summary="With bubble notes">
        <div className="form-grid">
          <TextField label="Customer name" defaultValue="Dana Whitfield" hint="As it should appear on the estimate." />
          <TextField
            label="Labor rate"
            prefix="$"
            suffix="/ hr"
            inputMode="decimal"
            defaultValue="65.00"
            info="What you charge per crew hour. Your price book sets the default; change it here for this job only."
          />
          <TextField
            label="Hours"
            suffix="hrs"
            inputMode="decimal"
            defaultValue="36.5"
            info="Total crew hours you expect the job to take, including setup and cleanup."
          />
          <SelectField label="Multiplier" defaultValue="1.15" info="Raises the whole job price for harder conditions, like a second-story deck or a rush start.">
            <option value="1">Standard (×1.00)</option>
            <option value="1.15">Difficult access (×1.15)</option>
            <option value="1.25">Rush (×1.25)</option>
          </SelectField>
          <TextField label="Customer email" type="email" defaultValue="dana@" error="Enter a full email address, like name@example.com." />
        </div>
        <div style={{ marginTop: "var(--sp-4)" }}>
          <TextAreaField label="Estimate notes" defaultValue="Remove existing deck boards and rebuild 12×16 deck with composite boards on new joists." />
        </div>
      </Section>

      <Section title="Ticket stages" storageKey="styleguide.badges">
        <div className="row">
          {STAGES.map(([label, tone]) => (
            <Badge key={label} tone={tone}>
              {label}
            </Badge>
          ))}
        </div>
      </Section>

      <Section
        title="Materials table"
        storageKey="styleguide.table"
        summary={money(materialsTotal)}
        info="Tables line up money and quantities on the right so totals are easy to scan."
        actions={
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            Add item
          </Button>
        }
      >
        <DataTable
          columns={MATERIAL_COLUMNS}
          rows={EXAMPLE_MATERIALS}
          rowKey={(r) => r.id}
          footer={
            <tr>
              <td colSpan={3}>Materials subtotal</td>
              <td className="num">{money(materialsTotal)}</td>
            </tr>
          }
        />
      </Section>

      <Section title="Bubble notes" storageKey="styleguide.tips" defaultOpen={false}>
        <p>
          Hover, tab to, or tap the <InfoTip label="Example bubble note">Bubble notes explain a field in plain words without cluttering the screen.</InfoTip> button
          next to any label to read what it means.
        </p>
      </Section>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add material"
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>
              Add to estimate
            </Button>
          </>
        }
      >
        <TextField label="Item" placeholder="e.g. Joist hangers" />
        <div className="form-grid">
          <TextField label="Quantity" inputMode="decimal" />
          <TextField label="Unit cost" prefix="$" inputMode="decimal" />
        </div>
      </Sheet>
    </ModulePage>
  );
}

export const styleguideModule: ModuleDefinition = {
  id: "styleguide",
  label: "Style guide",
  description: "Every building block the app uses, in one place.",
  icon: "palette",
  group: "admin",
  order: 95,
  roles: ["admin"],
  Page: StyleGuidePage,
};
