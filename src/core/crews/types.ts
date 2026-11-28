import { EVENT_COLORS, type EventColor } from "../calendar/types";

/** A team that goes out to jobs together. Its color shows on every booking, board lane and map pin for the crew. */
export interface Crew {
  id: string;
  name: string;
  color: EventColor;
  /** Trade labels from Settings → Trades. */
  skills: string[];
  /** Days worked, 0 = Sunday … 6 = Saturday, ascending. */
  workDays: number[];
  /** "HH:MM", 24-hour. */
  dayStart: string;
  dayEnd: string;
  notes: string;
  active: boolean;
  sort: number;
  isExample: boolean;
}

export type CrewInput = Pick<Crew, "name" | "color" | "skills" | "workDays" | "dayStart" | "dayEnd" | "notes" | "active">;

/** Someone in the field. Works their crew's days and hours. */
export interface Technician {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  crewId: string | null;
  /** Their app login, once they have one. */
  profileId: string | null;
  skills: string[];
  notes: string;
  active: boolean;
  isExample: boolean;
}

export type TechnicianInput = Pick<Technician, "fullName" | "phone" | "email" | "crewId" | "profileId" | "skills" | "notes" | "active">;

/** Where crews and techs live. The live app uses Supabase; preview mode and tests keep them in memory. */
export interface CrewsBackend {
  /** Every crew and tech, retired ones included. Crews in their saved order. */
  list(): Promise<{ crews: Crew[]; technicians: Technician[] }>;
  createCrew(input: CrewInput): Promise<Crew>;
  updateCrew(id: string, patch: Partial<CrewInput> & { sort?: number }): Promise<Crew>;
  createTechnician(input: TechnicianInput): Promise<Technician>;
  updateTechnician(id: string, patch: Partial<TechnicianInput>): Promise<Technician>;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday-first, the way the calendar week runs. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const COLOR_NAMES: Record<EventColor, string> = {
  teal: "Teal",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  orange: "Orange",
  red: "Red",
  purple: "Purple",
  slate: "Slate",
};

export const NEW_CREW: CrewInput = {
  name: "",
  color: "teal",
  skills: [],
  workDays: [1, 2, 3, 4, 5],
  dayStart: "07:00",
  dayEnd: "15:30",
  notes: "",
  active: true,
};

export const NEW_TECHNICIAN: TechnicianInput = {
  fullName: "",
  phone: "",
  email: "",
  crewId: null,
  profileId: null,
  skills: [],
  notes: "",
  active: true,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same rules as the crews table checks. Returns a message to show, or null when fine. */
export function checkCrew(c: CrewInput, others: Pick<Crew, "id" | "name">[] = [], id?: string): string | null {
  if (!c.name.trim()) return "Give the crew a name.";
  const key = c.name.trim().toLowerCase();
  if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === key)) return "Another crew already has that name.";
  if (!EVENT_COLORS.includes(c.color)) return "Pick a color from the palette.";
  if (c.workDays.length === 0) return "Pick at least one working day.";
  if (c.workDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Working days must be Sunday to Saturday.";
  if (!TIME.test(c.dayStart) || !TIME.test(c.dayEnd)) return "Pick a start and end time.";
  if (c.dayEnd <= c.dayStart) return "The day must end after it starts.";
  return null;
}

export function checkTechnician(t: TechnicianInput): string | null {
  if (!t.fullName.trim()) return "Enter the tech's name.";
  if (t.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email.trim())) return "Enter a valid email address, or leave it empty.";
  return null;
}

/** Trims text, sorts days and drops duplicate skills, the way they're saved. */
export function normalizeCrew<T extends Partial<CrewInput>>(c: T): T {
  const out = { ...c };
  if (out.name !== undefined) out.name = out.name.trim();
  if (out.notes !== undefined) out.notes = out.notes.trim();
  if (out.skills !== undefined) out.skills = uniq(out.skills);
  if (out.workDays !== undefined) out.workDays = [...new Set(out.workDays)].sort((a, b) => a - b);
  return out;
}

export function normalizeTechnician<T extends Partial<TechnicianInput>>(t: T): T {
  const out = { ...t };
  if (out.fullName !== undefined) out.fullName = out.fullName.trim();
  if (out.phone !== undefined) out.phone = out.phone.trim();
  if (out.email !== undefined) out.email = out.email.trim().toLowerCase();
  if (out.notes !== undefined) out.notes = out.notes.trim();
  if (out.skills !== undefined) out.skills = uniq(out.skills);
  return out;
}

const uniq = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

/** "7:00 AM – 3:30 PM". */
export function formatHours(start: string, end: string): string {
  return `${clock(start)} – ${clock(end)}`;
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Mon–Fri", "Mon–Sat", "Mon, Wed, Fri", "Every day". */
export function formatDays(days: number[]): string {
  const ordered = WEEKDAY_ORDER.filter((d) => days.includes(d));
  if (ordered.length === 7) return "Every day";
  if (ordered.length === 0) return "No days";
  // A Monday-first run with no gaps reads as a range.
  const idx = ordered.map((d) => WEEKDAY_ORDER.indexOf(d));
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (run && ordered.length >= 3) return `${WEEKDAYS[ordered[0]]}–${WEEKDAYS[ordered[ordered.length - 1]]}`;
  return ordered.map((d) => WEEKDAYS[d]).join(", ");
}

/** First palette color no active crew uses yet, so new crews are easy to tell apart. */
export function nextFreeColor(crews: Pick<Crew, "color" | "active">[]): EventColor {
  const used = new Set(crews.filter((c) => c.active).map((c) => c.color));
  return EVENT_COLORS.find((c) => !used.has(c)) ?? EVENT_COLORS[crews.length % EVENT_COLORS.length];
}
