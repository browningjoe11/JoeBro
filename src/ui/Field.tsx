import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { InfoTip } from "./InfoTip";

interface FieldShellProps {
  label: string;
  /** Short help shown under the field. */
  hint?: string;
  /** Error message; marks the field invalid. */
  error?: string;
  /** Longer explanation in a bubble note next to the label. */
  info?: ReactNode;
  /** Unit shown inside the field, e.g. "$" or "hrs". */
  prefix?: string;
  suffix?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

function FieldShell({ label, hint, error, info, prefix, suffix, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {info && <InfoTip label={`About ${label}`}>{info}</InfoTip>}
      </div>
      <div className="field-control">
        {prefix && <span className="field-affix">{prefix}</span>}
        {children({ id, describedBy, invalid: !!error })}
        {suffix && <span className="field-affix">{suffix}</span>}
      </div>
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errId}>
          {error}
        </p>
      )}
    </div>
  );
}

type Common = Omit<FieldShellProps, "children">;

export function TextField({ label, hint, error, info, prefix, suffix, ...input }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell {...{ label, hint, error, info, prefix, suffix }}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...input} />
      )}
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, info, children, ...select }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell {...{ label, hint, error, info }}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...select}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function TextAreaField({ label, hint, error, info, ...area }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell {...{ label, hint, error, info }}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} rows={4} {...area} />
      )}
    </FieldShell>
  );
}
