import { ALL_ROLES, type ModuleDefinition } from "../../core/modules";
import { Dashboard } from "./Dashboard";

export const dashboardModule: ModuleDefinition = {
  id: "dashboard",
  label: "Dashboard",
  description: "What each ticket needs next to keep moving.",
  icon: "dashboard",
  group: "overview",
  order: 10,
  roles: ALL_ROLES,
  Page: Dashboard,
};
