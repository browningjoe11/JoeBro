import { ComingSoon, ModulePage } from "../../core/ModulePage";
import type { ModuleDefinition } from "../../core/modules";

function SettingsPage() {
  return (
    <ModulePage title="Settings" description="Users, roles, company profile and modules.">
      <ComingSoon
        chunk="F5"
        items={[
          "Invite users and set roles",
          "Company profile and logo",
          "Turn modules on or off",
        ]}
      />
    </ModulePage>
  );
}

export const settingsModule: ModuleDefinition = {
  id: "settings",
  label: "Settings",
  description: "Users, roles, company profile and modules.",
  icon: "settings",
  group: "admin",
  order: 90,
  roles: ["admin"],
  Page: SettingsPage,
};
