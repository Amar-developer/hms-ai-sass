import { isModuleEnabled } from "./hmsLogic";

export function canOpenModule(
  id: string,
  roleAllowedModules: string[],
  clinic: any,
) {
  const moduleKey =
    id === "subscriptions"
      ? "patient_subscriptions"
      : id === "billing"
        ? "billing_basic"
        : id === "opd"
          ? "consultations"
          : id;
  const moduleEnabled =
    isModuleEnabled(clinic, moduleKey) ||
    (id === "subscriptions" && isModuleEnabled(clinic, "subscriptions")) ||
    (id === "billing" &&
      (isModuleEnabled(clinic, "billing_advanced") ||
        isModuleEnabled(clinic, "billing"))) ||
    (id === "opd" &&
      (isModuleEnabled(clinic, "consultation") ||
        isModuleEnabled(clinic, "appointments")));
  return (
    roleAllowedModules.includes(id) &&
    (id === "dashboard" ||
      id === "queue" ||
      id === "reports" ||
      id === "items" ||
      id === "error_logs" ||
      id === "admin" ||
      id === "superadmin" ||
      moduleEnabled)
  );
}
