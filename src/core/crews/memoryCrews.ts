import {
  checkCrew,
  checkTechnician,
  normalizeCrew,
  normalizeTechnician,
  type Crew,
  type CrewInput,
  type CrewsBackend,
  type Technician,
  type TechnicianInput,
} from "./types";

/** Same ids as the sample calendar's crew bookings (memoryCalendar) and close to supabase/seed.sql. */
export const SAMPLE_CREW_IDS = { deck: "crew-deck", siding: "crew-siding", remodel: "crew-remodel" } as const;

function sampleCrews(): Crew[] {
  const base = { notes: "", active: true, isExample: true } as const;
  return [
    { ...base, id: SAMPLE_CREW_IDS.deck, name: "Deck crew", color: "teal", skills: ["Carpentry", "Decks"], workDays: [1, 2, 3, 4, 5], dayStart: "07:00", dayEnd: "15:30", sort: 10 },
    { ...base, id: SAMPLE_CREW_IDS.siding, name: "Siding crew", color: "orange", skills: ["Siding", "Roofing"], workDays: [1, 2, 3, 4, 5, 6], dayStart: "07:00", dayEnd: "16:00", sort: 20 },
    {
      ...base,
      id: SAMPLE_CREW_IDS.remodel,
      name: "Remodel crew",
      color: "purple",
      skills: ["Remodel", "Drywall", "Painting", "Flooring"],
      workDays: [1, 2, 3, 4, 5],
      dayStart: "08:00",
      dayEnd: "16:30",
      sort: 30,
    },
  ];
}

function sampleTechs(): Technician[] {
  const base = { email: "", profileId: null, notes: "", active: true, isExample: true } as const;
  return [
    { ...base, id: "tech-1", fullName: "Mike Carter", phone: "(302) 555-0101", crewId: SAMPLE_CREW_IDS.deck, skills: ["Carpentry", "Decks"] },
    { ...base, id: "tech-2", fullName: "Luis Ortega", phone: "(302) 555-0102", crewId: SAMPLE_CREW_IDS.deck, skills: ["Carpentry"] },
    { ...base, id: "tech-3", fullName: "Sam Hill", phone: "(302) 555-0103", crewId: SAMPLE_CREW_IDS.siding, skills: ["Siding", "Roofing"] },
    { ...base, id: "tech-4", fullName: "Rosa Bennett", phone: "(302) 555-0104", crewId: SAMPLE_CREW_IDS.remodel, skills: ["Remodel", "Painting"] },
    { ...base, id: "tech-5", fullName: "Jordan Price", phone: "(302) 555-0105", crewId: null, skills: ["Fencing"] },
  ];
}

/** Crews kept in memory for preview mode and tests. Follows the same rules as the database. */
export function memoryCrews(opts: { empty?: boolean } = {}) {
  let crews: Crew[] = opts.empty ? [] : sampleCrews();
  let techs: Technician[] = opts.empty ? [] : sampleTechs();
  let n = 0;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const fail = (msg: string | null) => {
    if (msg) throw new Error(msg);
  };
  const sorted = () => [...crews].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const backend: CrewsBackend = {
    async list() {
      await tick();
      return {
        crews: sorted().map((c) => structuredClone(c)),
        technicians: [...techs].sort((a, b) => a.fullName.localeCompare(b.fullName)).map((t) => structuredClone(t)),
      };
    },
    async createCrew(input: CrewInput) {
      await tick();
      const c = normalizeCrew(input);
      fail(checkCrew(c, crews));
      const crew: Crew = { ...c, id: `crew-new-${++n}`, sort: crews.reduce((m, x) => Math.max(m, x.sort), 0) + 10, isExample: false };
      crews = [...crews, crew];
      return structuredClone(crew);
    },
    async updateCrew(id, patch) {
      await tick();
      const old = crews.find((c) => c.id === id);
      if (!old) throw new Error("That crew no longer exists. Reload and try again.");
      const next: Crew = { ...old, ...normalizeCrew(patch) };
      fail(checkCrew(next, crews, id));
      crews = crews.map((c) => (c.id === id ? next : c));
      return structuredClone(next);
    },
    async createTechnician(input: TechnicianInput) {
      await tick();
      const t = normalizeTechnician(input);
      fail(checkTechnician(t));
      if (t.profileId && techs.some((x) => x.profileId === t.profileId)) throw new Error("That login is already linked to another tech.");
      const tech: Technician = { ...t, id: `tech-new-${++n}`, isExample: false };
      techs = [...techs, tech];
      return structuredClone(tech);
    },
    async updateTechnician(id, patch) {
      await tick();
      const old = techs.find((t) => t.id === id);
      if (!old) throw new Error("That tech no longer exists. Reload and try again.");
      const next: Technician = { ...old, ...normalizeTechnician(patch) };
      fail(checkTechnician(next));
      if (next.profileId && techs.some((x) => x.id !== id && x.profileId === next.profileId)) throw new Error("That login is already linked to another tech.");
      techs = techs.map((t) => (t.id === id ? next : t));
      return structuredClone(next);
    },
  };
  return { backend, crews: () => sorted(), technicians: () => [...techs] };
}
