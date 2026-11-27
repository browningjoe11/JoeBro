import { ComingSoon, ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";

function InvoicingPage() {
  return (
    <ModulePage title="Invoicing" description="Invoices, reminders and payment schedules.">
      <ComingSoon
        chunk="I1–I5"
        items={[
          "Invoice from approved ticket",
          "Invoice due emails and reminders",
          "Payment schedules and partial invoices",
        ]}
      />
    </ModulePage>
  );
}

export const invoicingModule: ModuleDefinition = {
  id: "invoicing",
  label: "Invoicing",
  description: "Invoices, reminders and payment schedules.",
  icon: "invoicing",
  group: "workflow",
  order: 70,
  roles: ["admin", "reviewer"],
  Page: InvoicingPage,
};
