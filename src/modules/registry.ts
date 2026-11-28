import type { ModuleDefinition, Role } from "../core/modules";
import { dashboardModule } from "./dashboard";
import { ticketsModule } from "./tickets";
import { calendarModule } from "./calendar";
import { contactsModule } from "./contacts";
import { salesModule } from "./sales";
import { operationsModule } from "./operations";
import { onsiteModule } from "./onsite";
import { reviewModule } from "./review";
import { invoicingModule } from "./invoicing";
import { priceBookModule } from "./price-book";
import { importModule } from "./import";
import { settingsModule } from "./settings";
import { signatureModule } from "./signature";
import { styleguideModule } from "./styleguide";

/** Every module in the app. Add new modules here; menu and routes follow automatically. */
export const MODULES: readonly ModuleDefinition[] = [
  dashboardModule,
  calendarModule,
  ticketsModule,
  contactsModule,
  salesModule,
  operationsModule,
  onsiteModule,
  reviewModule,
  invoicingModule,
  priceBookModule,
  importModule,
  signatureModule,
  settingsModule,
  styleguideModule,
];

/** Modules a role may open, in menu order. `disabled` holds ids an admin turned off (chunk F5). */
export function modulesFor(role: Role, modules: readonly ModuleDefinition[] = MODULES, disabled: ReadonlySet<string> = new Set()) {
  return modules
    .filter((m) => m.roles.includes(role) && !disabled.has(m.id))
    .slice()
    .sort((a, b) => a.order - b.order);
}
