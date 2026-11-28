import type { Role } from "../modules";
import { DEFAULT_COMPANY, type CompanySettings, type Invite, type ListItem, type SettingsBackend, type TeamMember } from "./types";

/** Same starting choices as the settings migration. */
const DEFAULT_LISTS: [ListItem["list"], string][] = [
  ...["Google", "Facebook", "Referral", "Repeat customer", "Yard sign", "Truck or vehicle", "Other"].map((l) => ["lead_source", l] as [ListItem["list"], string]),
  ...["Carpentry", "Decks", "Siding", "Roofing", "Remodel", "Fencing", "Painting", "Drywall", "Flooring", "Other"].map(
    (l) => ["trade", l] as [ListItem["list"], string],
  ),
];

/**
 * Settings kept in memory: used in preview mode (no Supabase key) and in tests.
 * Nothing is saved between page loads.
 */
export function memorySettings(seed: { team?: TeamMember[]; company?: Partial<CompanySettings> } = {}) {
  let company: CompanySettings = { ...DEFAULT_COMPANY, ...seed.company };
  let n = 0;
  const nextId = () => `mem-${++n}`;
  let lists: ListItem[] = DEFAULT_LISTS.map(([list, label], i) => ({ id: nextId(), list, label, sort: (i + 1) * 10, active: true }));
  let team: TeamMember[] = seed.team ?? [
    { id: "preview-admin", email: "owner@example.com", fullName: "Preview admin", role: "admin", active: true, pending: false, lastSignInAt: null },
  ];
  const invites: Invite[] = [];
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const backend: SettingsBackend = {
    async publishLogo(dataUrl) {
      await tick();
      // Nothing to upload in preview: the preview signature shows the image itself.
      return dataUrl;
    },
    async loadCompany() {
      await tick();
      return structuredClone(company);
    },
    async saveCompany(next) {
      await tick();
      if (!next.name.trim()) throw new Error("Company name is required.");
      company = structuredClone(next);
    },
    async loadLists() {
      await tick();
      return lists.map((l) => ({ ...l })).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    },
    async addListItem(list, label, sort) {
      await tick();
      if (lists.some((l) => l.list === list && l.label.trim().toLowerCase() === label.trim().toLowerCase())) {
        throw new Error("That choice is already on the list.");
      }
      lists.push({ id: nextId(), list, label: label.trim(), sort, active: true });
    },
    async updateListItem(id, patch) {
      await tick();
      lists = lists.map((l) => (l.id === id ? { ...l, ...patch } : l));
    },
    async deleteListItem(id) {
      await tick();
      lists = lists.filter((l) => l.id !== id);
    },
    async loadTeam() {
      await tick();
      return team.map((m) => ({ ...m }));
    },
    async updateMember(id, patch) {
      await tick();
      const next = team.map((m) => (m.id === id ? { ...m, ...patch } : m));
      if (!next.some((m) => m.role === "admin" && m.active)) throw new Error("Keep at least one active admin.");
      team = next;
    },
    async invite(invite) {
      await tick();
      if (team.some((m) => m.email === invite.email.toLowerCase())) {
        throw new Error("That person already has an account. Change their role in the list instead.");
      }
      invites.push(invite);
      team.push({
        id: nextId(),
        email: invite.email.toLowerCase(),
        fullName: invite.fullName,
        role: invite.role as Role,
        active: true,
        pending: true,
        lastSignInAt: null,
      });
    },
  };
  return { backend, invites };
}
