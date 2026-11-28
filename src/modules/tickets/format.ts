import type { Tone } from "../../ui";
import { STAGE_PHASE, type Stage } from "../../core/tickets";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
export const formatMoney = (v: number | null) => (v === null ? "" : money.format(v));

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export const formatDate = (v: string | null) => (v ? dateFmt.format(new Date(v)) : "");
export const formatDateTime = (v: string) => dateTimeFmt.format(new Date(v));

/** "today", "in 2 days", "3 days ago" */
export function relativeDay(v: string | null, now = new Date()): string {
  if (!v) return "";
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date(v)) - start(now)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export const isOverdue = (v: string | null, now = new Date()) =>
  !!v && new Date(v).getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

export function stageTone(stage: Stage): Tone {
  if (stage === "lost") return "bad";
  if (stage === "paid") return "good";
  return (
    {
      Sales: "info",
      Operations: "brand",
      Review: "warn",
      Closed: "neutral",
    } as const
  )[STAGE_PHASE[stage]];
}

/** yyyy-mm-dd for a date input, from an ISO timestamp (local day). */
export function toDateInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midday local time on the chosen day, so time zones never push it to the day before. */
export function fromDateInput(v: string): string | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

/** "12480" or "$12,480.50" → 12480.5; blank → null; junk → NaN */
export function parseMoney(v: string): number | null {
  const t = v.replace(/[$,\s]/g, "");
  if (!t) return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
