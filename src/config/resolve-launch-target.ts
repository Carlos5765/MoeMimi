import type { AppConfig, LaunchTarget, StartReason } from "../types/app-config";

export function resolveLaunchTarget(
  config: AppConfig,
  reason: StartReason,
  defaultPetExists: boolean,
): LaunchTarget {
  if (!config.defaultPet || !defaultPetExists) return "main";
  return reason === "autostart"
    ? (config.autostart ?? "main")
    : (config.launch ?? "main");
}
