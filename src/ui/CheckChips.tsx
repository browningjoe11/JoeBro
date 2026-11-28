import { InfoTip } from "./InfoTip";
import type { ReactNode } from "react";

export interface ChipOption {
  value: string;
  label: string;
}

/** Pick any number of short choices (skills, weekdays) as toggle chips. Each chip is a real checkbox. */
export function CheckChips({
  label,
  options,
  value,
  onChange,
  hint,
  info,
  disabled,
}: {
  label: string;
  options: ChipOption[];
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  info?: ReactNode;
  disabled?: boolean;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <fieldset className="check-chips" disabled={disabled}>
      <legend>
        {label}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </legend>
      <div className="check-chips-list">
        {options.map((o) => (
          <label key={o.value} className="check-chip">
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </fieldset>
  );
}
