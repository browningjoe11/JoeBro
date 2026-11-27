import { ComingSoon, ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";

function SalesPage() {
  return (
    <ModulePage title="Sales" description="Site visits, estimates and customer signatures.">
      <ComingSoon
        chunk="S1–S9"
        items={[
          "Estimate builder with time, materials, adders and multipliers",
          "Live total as you type",
          "Personalized estimate emails and e-signature",
          "Pre-estimate site visit scheduling",
        ]}
      />
    </ModulePage>
  );
}

export const salesModule: ModuleDefinition = {
  id: "sales",
  label: "Sales",
  description: "Site visits, estimates and customer signatures.",
  icon: "sales",
  group: "workflow",
  order: 30,
  roles: ["admin", "sales"],
  Page: SalesPage,
};
