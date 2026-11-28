import { useEffect, useRef } from "react";
import { PIPELINE, STAGE_LABELS, type Stage } from "../../core/tickets";

/** The job's path, left to right, with the current stage highlighted. Lost jobs show where they stopped. */
export function StageBar({ stage, lostFrom }: { stage: Stage; lostFrom?: Stage | null }) {
  const at = stage === "lost" ? (lostFrom ?? null) : stage;
  const current = at ? PIPELINE.indexOf(at) : -1;
  const bar = useRef<HTMLOListElement>(null);

  // On narrow screens the bar scrolls sideways; keep the current stage in view.
  useEffect(() => {
    const el = bar.current;
    const step = el?.children[current] as HTMLElement | undefined;
    if (el && step && el.scrollWidth > el.clientWidth) el.scrollLeft = step.offsetLeft - (el.clientWidth - step.offsetWidth) / 2;
  }, [current]);

  return (
    <ol ref={bar} className={`stage-bar${stage === "lost" ? " stage-bar--lost" : ""}`} aria-label="Ticket stage">
      {PIPELINE.map((s, i) => {
        const state = i < current ? "done" : i === current ? (stage === "lost" ? "stopped" : "current") : "todo";
        return (
          <li key={s} className={`stage stage--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stage-dot" aria-hidden="true" />
            <span className="stage-name">{STAGE_LABELS[s]}</span>
            {state === "done" && <span className="visually-hidden"> (done)</span>}
            {state === "stopped" && <span className="visually-hidden"> (lost here)</span>}
          </li>
        );
      })}
    </ol>
  );
}
