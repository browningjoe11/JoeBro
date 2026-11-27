import type { ReactNode } from "react";

export type Tone = "neutral" | "brand" | "good" | "warn" | "bad" | "info";

/** Small status pill: ticket stages, payment status, soft vs confirmed, etc. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
