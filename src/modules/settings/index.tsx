import { Link } from "react-router-dom";
import { ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";
import { useSettings } from "../../core/settings";
import { CompanySection } from "./CompanySection";
import { CrewsSection, TechniciansSection } from "./CrewsSection";
import { ListsSection } from "./ListsSection";
import { ModulesSection } from "./ModulesSection";
import { TeamSection } from "./TeamSection";
import { Section } from "../../ui";

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
      <Section title="Email signatures" storageKey="settings.signatures" info="Each person's sign-off for estimate and invoice emails. It uses the company profile above.">
        <p className="settings-help">
          Everyone sets up their own on the <Link to="/signature">Email signature</Link> page. As an admin you can open anyone's there and set it up for them.
        </p>
      </Section>
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
