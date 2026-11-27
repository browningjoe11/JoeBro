import { ComingSoon, ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";

function ContactsPage() {
  return (
    <ModulePage title="Contacts" description="Every customer, their properties and their job history.">
      <ComingSoon
        chunk="C1"
        items={[
          "Searchable customer list",
          "Multiple properties per customer",
          "Edits on a ticket update the customer record",
        ]}
      />
    </ModulePage>
  );
}

export const contactsModule: ModuleDefinition = {
  id: "contacts",
  label: "Contacts",
  description: "Every customer, their properties and their job history.",
  icon: "contacts",
  group: "workflow",
  order: 20,
  roles: ["admin", "sales", "operations", "reviewer"],
  Page: ContactsPage,
};
