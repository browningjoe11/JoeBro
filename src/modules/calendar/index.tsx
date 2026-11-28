import { ALL_ROLES, type ModuleDefinition } from "../../core/modules";
import { CalendarPage } from "./CalendarPage";

export const calendarModule: ModuleDefinition = {
  id: "calendar",
  label: "Calendar",
  description: "Site visits and jobs on one shared calendar.",
  icon: "calendar",
  group: "overview",
  order: 12,
  // Technicians and reviewers can look; the database shows technicians only their own bookings.
  roles: ALL_ROLES,
  Page: CalendarPage,
};
