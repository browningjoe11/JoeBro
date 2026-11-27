import { ComingSoon, ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";

function OnsitePage() {
  return (
    <ModulePage title="Onsite" description="Today's jobs, scope of work, upsells and photos.">
      <ComingSoon
        chunk="M1–M4"
        items={[
          "My Day job list for phones and tablets",
          "Add upsells onsite",
          "Before and after photos and completion report",
        ]}
      />
    </ModulePage>
  );
}

export const onsiteModule: ModuleDefinition = {
  id: "onsite",
  label: "Onsite",
  description: "Today's jobs, scope of work, upsells and photos.",
  icon: "onsite",
  group: "workflow",
  order: 50,
  roles: ["admin", "operations", "technician"],
  Page: OnsitePage,
};
