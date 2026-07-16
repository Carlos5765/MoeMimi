export type LaunchTarget = "main" | "pet";

export type StartReason = "manual" | "autostart";

export interface AppConfig {
  defaultPet?: string;
  launch?: LaunchTarget;
  autostart?: LaunchTarget;
  ui?: {
    theme?: "light" | "dark" | "system";
    locale?: string;
  };
}
