import { Route, Routes } from "react-router-dom";
import { ALL_ROLES, type ModuleDefinition } from "../../core/modules";
import { NewTicket } from "./NewTicket";
import { TicketDetail } from "./TicketDetail";
import { TicketList } from "./TicketList";

function TicketsPage() {
  return (
    <Routes>
      <Route index element={<TicketList />} />
      <Route path="new" element={<NewTicket />} />
      <Route path=":number" element={<TicketDetail />} />
    </Routes>
  );
}

export const ticketsModule: ModuleDefinition = {
  id: "tickets",
  label: "Tickets",
  description: "Every job from first call to paid.",
  icon: "tickets",
  group: "workflow",
  order: 15,
  // Technicians see only tickets assigned to them (the database filters).
  roles: ALL_ROLES,
  Page: TicketsPage,
};
