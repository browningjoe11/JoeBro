import { ComingSoon, ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";

function OperationsPage() {
  return (
    <ModulePage title="Operations" description="Schedule signed jobs, plan routes and notify customers.">
      <ComingSoon
        chunk="O1–O6"
        items={[
          "Color-coded crew calendar with soft scheduling",
          "Map and route planning",
          "One-button day notices with arrival windows",
        ]}
      />
    </ModulePage>
  );
}

export const operationsModule: ModuleDefinition = {
  id: "operations",
  label: "Operations",
  description: "Schedule signed jobs, plan routes and notify customers.",
  icon: "operations",
  group: "workflow",
  order: 40,
  roles: ["admin", "operations"],
  Page: OperationsPage,
};
