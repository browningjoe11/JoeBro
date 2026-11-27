import { ComingSoon, ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";

function ReviewPage() {
  return (
    <ModulePage title="Review" description="Check completed work against the scope before billing.">
      <ComingSoon
        chunk="R1"
        items={[
          "Scope of work next to the tech's report",
          "Approve or send back with notes",
        ]}
      />
    </ModulePage>
  );
}

export const reviewModule: ModuleDefinition = {
  id: "review",
  label: "Review",
  description: "Check completed work against the scope before billing.",
  icon: "review",
  group: "workflow",
  order: 60,
  roles: ["admin", "reviewer"],
  Page: ReviewPage,
};
