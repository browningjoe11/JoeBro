import { EVENT_COLORS, type EventColor } from "../calendar/types";
import { COLOR_NAMES } from "./types";
import "./crews.css";

/** A crew's name with its color dot. Use it anywhere a crew is named so the color always travels with it. */
export function CrewChip({ name, color, retired = false }: { name: string; color: EventColor; retired?: boolean }) {
  return (
    <span className={`crew-chip ev--${color}${retired ? " crew-chip--retired" : ""}`}>
      <i className="crew-dot" aria-hidden="true" />
      {name}
      {retired && <span className="crew-chip-note"> (retired)</span>}
    </span>
  );
}

/** Pick one palette color. Colors other crews already use are marked, so each crew can stay distinct. */
export function ColorPicker({
  label,
  value,
  onChange,
  taken = {},
  disabled,
}: {
  label: string;
  value: EventColor;
  onChange: (c: EventColor) => void;
  /** Color → name of the crew already using it. */
  taken?: Partial<Record<EventColor, string>>;
  disabled?: boolean;
}) {
  return (
    <fieldset className="color-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div className="color-picker-swatches">
        {EVENT_COLORS.map((c) => (
          <label key={c} className={`color-swatch ev--${c}`} title={taken[c] ? `${COLOR_NAMES[c]}, used by ${taken[c]}` : COLOR_NAMES[c]}>
            <input type="radio" name={label} value={c} checked={value === c} onChange={() => onChange(c)} />
            <span className="color-swatch-dot" aria-hidden="true" />
            <span className="color-swatch-name">{COLOR_NAMES[c]}</span>
            {taken[c] && <span className="visually-hidden"> (used by {taken[c]})</span>}
          </label>
        ))}
      </div>
      {taken[value] && <p className="field-hint">{taken[value]} uses this color too. A different one keeps the calendar easy to read.</p>}
    </fieldset>
  );
}
