import { useMemo, useState } from "react";
import { TextField } from "../../ui";
import { usePriceBook } from "./PriceBookProvider";
import { describePrice, findItems, KIND_LABELS, type PriceItem, type PriceKind } from "./types";

interface PriceItemPickerProps {
  /** Only offer one kind, e.g. materials for the Materials section of an estimate. */
  kind?: PriceKind;
  /** Only offer items for this trade (plus items for any trade). */
  trade?: string;
  onPick: (item: PriceItem) => void;
  label?: string;
}

/**
 * Search box with the matching active price book items under it. Retired items
 * never show. The estimate builder (S3) uses this to add lines.
 */
export function PriceItemPicker({ kind, trade, onPick, label }: PriceItemPickerProps) {
  const { items, error } = usePriceBook();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => findItems(items ?? [], { query, kind, trade }).slice(0, 12), [items, query, kind, trade]);
  const what = kind ? KIND_LABELS[kind].title.toLowerCase() : "the price book";
  const listLabel = `Matching ${kind ? KIND_LABELS[kind].title.toLowerCase() : "items"}`;

  return (
    <div className="picker">
      <TextField label={label ?? `Find in ${what}`} type="search" placeholder="Type a name, trade or unit" value={query} onChange={(e) => setQuery(e.target.value)} />
      {error ? (
        <p className="settings-error" role="alert">
          Couldn't load the price book: {error}
        </p>
      ) : items === null ? (
        <p className="picker-empty">Loading…</p>
      ) : matches.length === 0 ? (
        <p className="picker-empty">{query ? "Nothing matches. Try another word." : "No items yet. An admin can add them in Price book."}</p>
      ) : (
        <ul className="picker-list" aria-label={listLabel}>
          {matches.map((i) => (
            <li key={i.id}>
              <button type="button" className="picker-item" onClick={() => onPick(i)}>
                <span className="picker-name">{i.name}</span>
                <span className="picker-meta">
                  {!kind && `${KIND_LABELS[i.kind].singular} · `}
                  {describePrice(i)}
                  {i.trade && ` · ${i.trade}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
