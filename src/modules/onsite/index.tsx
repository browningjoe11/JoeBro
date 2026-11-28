import type { ModuleDefinition } from "../../core/modules";
import { MyDay } from "./MyDay";

export const onsiteModule: ModuleDefinition = {
  id: "onsite",
  label: "My Day",
  description: "Today's jobs in driving order, with directions, the customer's number and the scope of work.",
  icon: "onsite",
  group: "workflow",
  order: 50,
  roles: ["admin", "operations", "technician"],
  homeFor: ["technician"],
  Page: MyDay,
};
