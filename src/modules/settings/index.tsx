import { ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";
import { useSettings } from "../../core/settings";
import { CompanySection } from "./CompanySection";
import { CrewsSection, TechniciansSection } from "./CrewsSection";
import { ListsSection } from "./ListsSection";
import { ModulesSection } from "./ModulesSection";
import { TeamSection } from "./TeamSection";

function SettingsPage() {
  const { error } = useSettings();
  return (
    <ModulePage title="Settings" description="Team and roles, crews and technicians, company profile, modules and dropdown lists.">
      {error && (
        <p className="settings-error" role="alert">
          Couldn't load settings: {error}
        </p>
      )}
      <TeamSection />
      <CrewsSection />
      <TechniciansSection />
      <CompanySection />
      <ModulesSection />
      <ListsSection />
    </ModulePage>
  );
}

export const settingsModule: ModuleDefinition = {
  id: "settings",
  label: "Settings",
  description: "Users, roles, crews, company profile and modules.",
  icon: "settings",
  group: "admin",
  order: 90,
  roles: ["admin"],
  Page: SettingsPage,
};
