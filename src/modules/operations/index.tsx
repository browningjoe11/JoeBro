import type { ModuleDefinition } from "../../core/modules";
import { OperationsPage } from "./OperationsPage";

export const operationsModule: ModuleDefinition = {
  id: "operations",
  label: "Operations",
  description: "Plan the week: drag signed jobs onto crew lanes, confirm them, and see each day on a map.",
  icon: "operations",
  group: "workflow",
  order: 40,
  roles: ["admin", "operations"],
  Page: OperationsPage,
};
