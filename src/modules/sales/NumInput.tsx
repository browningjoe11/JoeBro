import { useEffect, useState } from "react";

const parse = (t: string) => {
  const c = t.replace(/[$,%\s]/g, "");
  return c === "" ? Number.NaN : Number(c);
};
const show = (v: number) => (Number.isFinite(v) ? String(v) : "");
const same = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b));

/**
 * Number box for estimate lines. Keeps what you typed ("1.", "") while passing the number up on
 * every keystroke, so the total updates live. A blank or bad entry is passed as NaN, which the
 * estimate math ignores and lists as an issue.
 */
export function NumInput({
  value,
  onChange,
  label,
  prefix,
  suffix,
  invalid,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Accessible name, e.g. "Hours for Carpenter". */
  label: string;
  prefix?: string;
  suffix?: string;
  invalid?: boolean;
}) {
  const [text, setText] = useState(show(value));
  useEffect(() => {
    // Only overwrite the box when the number changed from outside (loading a version), not while typing.
    setText((t) => (same(parse(t), value) ? t : show(value)));
  }, [value]);
  return (
    <span className={`num-input${invalid ? " num-input--bad" : ""}`}>
      {prefix && <span className="num-affix">{prefix}</span>}
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parse(e.target.value));
        }}
      />
      {suffix && <span className="num-affix">{suffix}</span>}
    </span>
  );
}
