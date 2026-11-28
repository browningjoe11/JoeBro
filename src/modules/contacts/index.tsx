import { Route, Routes } from "react-router-dom";
import type { ModuleDefinition } from "../../core/modules";
import { ContactDetail } from "./ContactDetail";
import { ContactList } from "./ContactList";
import { NewContact } from "./NewContact";
import "./contacts.css";

function ContactsPage() {
  return (
    <Routes>
      <Route index element={<ContactList />} />
      <Route path="new" element={<NewContact />} />
      <Route path=":id" element={<ContactDetail />} />
    </Routes>
  );
}

export const contactsModule: ModuleDefinition = {
  id: "contacts",
  label: "Contacts",
  description: "Every customer, their properties and their job history.",
  icon: "contacts",
  group: "workflow",
  order: 20,
  // Technicians reach customer details through their assigned tickets instead.
  roles: ["admin", "sales", "operations", "reviewer"],
  Page: ContactsPage,
};
