import { useId, type ReactNode } from "react";
import { InfoTip } from "./InfoTip";
import { usePersistentState } from "./usePersistentState";

interface SectionProps {
  title: string;
  /**
   * Remembers open/closed in this browser under this key, e.g. "estimate.materials".
   * Leave out to start open every time.
   */
  storageKey?: string;
  defaultOpen?: boolean;
  /** Short summary shown in the header, visible even when collapsed (e.g. a subtotal). */
  summary?: ReactNode;
  /** Bubble note explaining what the section is for. */
  info?: ReactNode;
  /** Buttons shown on the right of the header. */
  actions?: ReactNode;
  children: ReactNode;
}

/** Expandable / collapsible section used on ticket, estimate and settings screens. */
export function Section({ title, storageKey, defaultOpen = true, summary, info, actions, children }: SectionProps) {
  const [open, setOpen] = usePersistentState(storageKey ? `jb.section.${storageKey}` : null, defaultOpen);
  const bodyId = useId();

  return (
    <section className={`section${open ? "" : " section--closed"}`}>
      <header className="section-head">
        <button type="button" className="section-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <span className="section-chev" aria-hidden="true" />
          <h2>{title}</h2>
        </button>
        {info && <InfoTip label={`About ${title}`}>{info}</InfoTip>}
        {summary !== undefined && <span className="section-summary">{summary}</span>}
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      <div className="section-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
