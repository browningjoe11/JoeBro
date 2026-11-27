import { ComingSoon, ModulePage } from "../../core/ModulePage";
import { ALL_ROLES, type ModuleDefinition } from "../../core/modules";

function DashboardPage() {
  return (
    <ModulePage title="Dashboard" description="What each ticket needs next to keep moving.">
      <ComingSoon
        chunk="F7"
        items={[
          "Next actions for your role",
          "Ticket counts by stage",
          "Overdue follow-ups and invoices",
        ]}
      />
    </ModulePage>
  );
}

export const dashboardModule: ModuleDefinition = {
  id: "dashboard",
  label: "Dashboard",
  description: "What each ticket needs next to keep moving.",
  icon: "dashboard",
  group: "overview",
  order: 10,
  roles: ALL_ROLES,
  Page: DashboardPage,
};
