import type { ModuleDefinition } from "../../core/modules";
import { SchedulingBoard } from "./SchedulingBoard";

export const operationsModule: ModuleDefinition = {
  id: "operations",
  label: "Operations",
  description: "Plan the week: drag signed jobs onto crew lanes and confirm them.",
  icon: "operations",
  group: "workflow",
  order: 40,
  roles: ["admin", "operations"],
  Page: SchedulingBoard,
};
