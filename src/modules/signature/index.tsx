import { ALL_ROLES, type ModuleDefinition } from "../../core/modules";
import { SignaturePage } from "./SignaturePage";
import "./signature.css";

export const signatureModule: ModuleDefinition = {
  id: "signature",
  label: "Email signature",
  description: "Your sign-off for estimate and invoice emails, ready to copy into Gmail or Outlook.",
  icon: "signature",
  group: "admin",
  order: 85,
  roles: ALL_ROLES,
  Page: SignaturePage,
};
