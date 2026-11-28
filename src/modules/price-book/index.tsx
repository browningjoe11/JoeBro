import { useMemo, useState } from "react";
import { Icon } from "../../core/Icon";
import { ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";
import { useCurrentUser } from "../../core/currentUser";
import {
  APPLIES_LABELS,
  describePrice,
  findItems,
  formatMoney,
  KIND_LABELS,
  PRICE_KINDS,
  usePriceBook,
  type PriceItem,
  type PriceKind,
} from "../../core/pricebook";
import { Badge, Button, DataTable, SelectField, Section, TextField, usePersistentState, type Column } from "../../ui";
import { ItemSheet } from "./ItemSheet";

type Editing = { item: PriceItem | null; kind: PriceKind } | null;

function PriceBookPage() {
  const { items, error } = usePriceBook();
  const { role } = useCurrentUser();
  const canEdit = role === "admin";
  const [query, setQuery] = useState("");
  const [show, setShow] = usePersistentState<"all" | PriceKind>("jb.pricebook.show", "all");
  const [retired, setRetired] = usePersistentState("jb.pricebook.retired", false);
  const [editing, setEditing] = useState<Editing>(null);

  const shown = useMemo(() => findItems(items ?? [], { query, includeRetired: retired }), [items, query, retired]);
  const kinds = show === "all" ? PRICE_KINDS : [show];

  return (
    <ModulePage
      title="Price book"
      description={
        canEdit
          ? "Labor rates, materials, adders and multipliers that estimates are priced from."
          : "Labor rates, materials, adders and multipliers that estimates are priced from. Only admins can change them."
      }
    >
      <div className="toolbar">
        <TextField label="Search" type="search" placeholder="Name, trade or unit" value={query} onChange={(e) => setQuery(e.target.value)} />
        <SelectField label="Show" value={show} onChange={(e) => setShow(e.target.value as "all" | PriceKind)}>
          <option value="all">Everything</option>
          {PRICE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k].title}
            </option>
          ))}
        </SelectField>
        <label className="check-row pb-retired">
          <input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />
          <span>Show retired items</span>
        </label>
        {canEdit && (
          <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setEditing({ item: null, kind: show === "all" ? "labor" : show })}>
            Add item
          </Button>
        )}
      </div>
      {error && (
        <p className="settings-error" role="alert">
          Couldn't load the price book: {error}
        </p>
      )}
      {kinds.map((kind) => (
        <KindSection
          key={kind}
          kind={kind}
          rows={shown.filter((i) => i.kind === kind)}
          loading={items === null && !error}
          filtered={!!query.trim()}
          canEdit={canEdit}
          onAdd={() => setEditing({ item: null, kind })}
          onEdit={(item) => setEditing({ item, kind })}
        />
      ))}
      <ItemSheet open={editing !== null} item={editing?.item ?? null} kind={editing?.kind ?? "labor"} onClose={() => setEditing(null)} />
    </ModulePage>
  );
}

interface KindSectionProps {
  kind: PriceKind;
  rows: PriceItem[];
  loading: boolean;
  filtered: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (item: PriceItem) => void;
}

function KindSection({ kind, rows, loading, filtered, canEdit, onAdd, onEdit }: KindSectionProps) {
  const meta = KIND_LABELS[kind];
  const active = rows.filter((r) => r.active).length;

  const columns: Column<PriceItem>[] = [
    {
      key: "name",
      header: "Item",
      render: (i) => (
        <span className="pb-cell">
          <span className="pb-name">
            {i.name}
            {!i.active && <Badge tone="warn">Retired</Badge>}
            {i.isExample && <Badge>Example</Badge>}
          </span>
          {i.description && <small>{i.description}</small>}
          {/* Phones: the price columns are off to the side, so repeat the price here. */}
          <small className="pb-phone-price">{describePrice(i)}</small>
        </span>
      ),
    },
    { key: "trade", header: "Trade", render: (i) => i.trade || <span className="pb-muted">Any</span> },
  ];
  if (kind === "multiplier") {
    columns.push(
      { key: "factor", header: "Factor", numeric: true, render: (i) => (i.factor === null ? "" : `×${i.factor}`) },
      { key: "applies", header: "Applies to", render: (i) => (i.appliesTo ? APPLIES_LABELS[i.appliesTo] : "") },
    );
  } else {
    columns.push({
      key: "price",
      header: meta.priceLabel,
      numeric: true,
      render: (i) => (
        <span className="pb-price">
          {formatMoney(i.price)} <small>/ {i.unit}</small>
        </span>
      ),
    });
    if (kind === "material") columns.push({ key: "markup", header: "Markup", numeric: true, render: (i) => (i.markupPct === null ? "" : `${i.markupPct}%`) });
  }
  if (canEdit)
    columns.push({
      key: "edit",
      header: "",
      render: (i) => (
        <Button size="sm" variant="ghost" onClick={() => onEdit(i)} aria-label={`Edit ${i.name}`}>
          Edit
        </Button>
      ),
    });

  return (
    <Section
      title={meta.title}
      storageKey={`pricebook.${kind}`}
      summary={`${active} ${active === 1 ? "item" : "items"}`}
      info={meta.info}
      actions={
        canEdit && (
          <Button size="sm" onClick={onAdd} aria-label={`Add a ${meta.singular}`}>
            Add
          </Button>
        )
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        empty={loading ? "Loading…" : filtered ? "Nothing matches your search." : canEdit ? `No ${meta.title.toLowerCase()} yet. Use Add to create one.` : `No ${meta.title.toLowerCase()} yet.`}
      />
    </Section>
  );
}

export const priceBookModule: ModuleDefinition = {
  id: "price-book",
  label: "Price book",
  description: "Labor rates, materials, adders and multipliers for estimates.",
  icon: "pricebook",
  group: "admin",
  order: 80,
  // Sales reads it to estimate; only admins change it (the database enforces this too).
  roles: ["admin", "sales"],
  Page: PriceBookPage,
};
