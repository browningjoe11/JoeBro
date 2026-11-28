import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventColor } from "../calendar/types";
import { checkCrew, checkTechnician, normalizeCrew, normalizeTechnician, type Crew, type CrewInput, type CrewsBackend, type Technician, type TechnicianInput } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
/** Postgres sends "07:00:00"; the app uses "07:00". */
const hhmm = (v: unknown) => s(v).slice(0, 5);

const CREW_COLUMNS = "id, name, color, skills, work_days, day_start, day_end, notes, active, sort, is_example";
const TECH_COLUMNS = "id, full_name, phone, email, crew_id, profile_id, skills, notes, active, is_example";

function fail(error: { message: string } | null): void {
  if (!error) return;
  const m = error.message;
  if (/crews_unique_name/.test(m)) throw new Error("Another crew already has that name.");
  if (/crews_name_present/.test(m)) throw new Error("Give the crew a name.");
  if (/crews_color_known/.test(m)) throw new Error("Pick a color from the palette.");
  if (/crews_hours_order/.test(m)) throw new Error("The day must end after it starts.");
  if (/crews_work_days_valid/.test(m)) throw new Error("Pick at least one working day.");
  if (/technicians_name_present/.test(m)) throw new Error("Enter the tech's name.");
  if (/technicians_profile_id_key/.test(m)) throw new Error("That login is already linked to another tech.");
  if (/row-level security|permission denied/i.test(m)) throw new Error("Your role can't change crews.");
  throw new Error(m);
}

function toCrew(r: Row): Crew {
  return {
    id: s(r.id),
    name: s(r.name),
    color: r.color as EventColor,
    skills: (r.skills as string[] | null) ?? [],
    workDays: ((r.work_days as number[] | null) ?? []).map(Number).sort((a, b) => a - b),
    dayStart: hhmm(r.day_start),
    dayEnd: hhmm(r.day_end),
    notes: s(r.notes),
    active: !!r.active,
    sort: Number(r.sort ?? 0),
    isExample: !!r.is_example,
  };
}

function toTech(r: Row): Technician {
  return {
    id: s(r.id),
    fullName: s(r.full_name),
    phone: s(r.phone),
    email: s(r.email),
    crewId: (r.crew_id as string) ?? null,
    profileId: (r.profile_id as string) ?? null,
    skills: (r.skills as string[] | null) ?? [],
    notes: s(r.notes),
    active: !!r.active,
    isExample: !!r.is_example,
  };
}

function crewRow(p: Partial<CrewInput> & { sort?: number }): Row {
  const c = normalizeCrew(p);
  const row: Row = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.color !== undefined) row.color = c.color;
  if (c.skills !== undefined) row.skills = c.skills;
  if (c.workDays !== undefined) row.work_days = c.workDays;
  if (c.dayStart !== undefined) row.day_start = c.dayStart;
  if (c.dayEnd !== undefined) row.day_end = c.dayEnd;
  if (c.notes !== undefined) row.notes = orNull(c.notes);
  if (c.active !== undefined) row.active = c.active;
  if (p.sort !== undefined) row.sort = p.sort;
  return row;
}

function techRow(p: Partial<TechnicianInput>): Row {
  const t = normalizeTechnician(p);
  const row: Row = {};
  if (t.fullName !== undefined) row.full_name = t.fullName;
  if (t.phone !== undefined) row.phone = orNull(t.phone);
  if (t.email !== undefined) row.email = orNull(t.email);
  if (t.crewId !== undefined) row.crew_id = t.crewId;
  if (t.profileId !== undefined) row.profile_id = t.profileId;
  if (t.skills !== undefined) row.skills = t.skills;
  if (t.notes !== undefined) row.notes = orNull(t.notes);
  if (t.active !== undefined) row.active = t.active;
  return row;
}

/** Nothing back from an update means row-level security hid it, or it's gone. */
function only<T>(rows: T[] | null, what: string): T {
  const row = rows?.[0];
  if (!row) throw new Error(`Your role can't change that ${what}, or it was deleted. Reload and try again.`);
  return row;
}

export function supabaseCrews(sb: SupabaseClient): CrewsBackend {
  return {
    async list() {
      const [crews, techs] = await Promise.all([
        sb.from("crews").select(CREW_COLUMNS).order("sort").order("name"),
        sb.from("technicians").select(TECH_COLUMNS).order("full_name"),
      ]);
      fail(crews.error);
      fail(techs.error);
      return {
        crews: ((crews.data ?? []) as Row[]).map(toCrew),
        technicians: ((techs.data ?? []) as Row[]).map(toTech),
      };
    },
    async createCrew(input) {
      const msg = checkCrew(normalizeCrew(input));
      if (msg) throw new Error(msg);
      // New crews go to the end of the list.
      const last = await sb.from("crews").select("sort").order("sort", { ascending: false }).limit(1);
      fail(last.error);
      const sort = Number((last.data as Row[] | null)?.[0]?.sort ?? 0) + 10;
      const { data, error } = await sb
        .from("crews")
        .insert({ ...crewRow(input), sort })
        .select(CREW_COLUMNS)
        .single();
      fail(error);
      return toCrew(data as Row);
    },
    async updateCrew(id, patch) {
      const { data, error } = await sb.from("crews").update(crewRow(patch)).eq("id", id).select(CREW_COLUMNS);
      fail(error);
      return toCrew(only(data as Row[] | null, "crew"));
    },
    async createTechnician(input) {
      const msg = checkTechnician(normalizeTechnician(input));
      if (msg) throw new Error(msg);
      const { data, error } = await sb.from("technicians").insert(techRow(input)).select(TECH_COLUMNS).single();
      fail(error);
      return toTech(data as Row);
    },
    async updateTechnician(id, patch) {
      const { data, error } = await sb.from("technicians").update(techRow(patch)).eq("id", id).select(TECH_COLUMNS);
      fail(error);
      return toTech(only(data as Row[] | null, "tech"));
    },
  };
}
