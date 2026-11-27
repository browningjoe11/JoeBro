import type { ComponentType } from "react";
import type { IconName } from "./Icon";

/** Who can use the app. Enforced by database rules in chunk F4; the menu filters on it too. */
export type Role = "admin" | "sales" | "operations" | "technician" | "reviewer";

export const ALL_ROLES: readonly Role[] = ["admin", "sales", "operations", "technician", "reviewer"];

/**
 * One pluggable area of the app. To add a module (now or as the system grows
 * into an ERP), create `src/modules/<id>/index.tsx` exporting a
 * ModuleDefinition and add it to `src/modules/registry.ts`. Navigation and
 * routing are built from the registry, so nothing else needs to change.
 */
export interface ModuleDefinition {
  /** Stable key, also the URL segment: `/contacts`. Lowercase letters and dashes. */
  id: string;
  /** Name shown in the menu and page header. */
  label: string;
  /** One line shown under the page title. */
  description: string;
  icon: IconName;
  /** Menu group. Modules in the same group are listed together. */
  group: ModuleGroup;
  /** Sort order inside the menu; lower comes first. */
  order: number;
  /** Roles that see this module. */
  roles: readonly Role[];
  /** The module's page. It handles its own sub-routes below `/<id>/*`. */
  Page: ComponentType;
}

export type ModuleGroup = "overview" | "workflow" | "admin";

export const GROUP_LABELS: Record<ModuleGroup, string> = {
  overview: "Overview",
  workflow: "Ticket workflow",
  admin: "Admin",
};
