import { AppConfigInvalidError } from "../core/errors";
import { isNonEmptyString, isRecord } from "../core/validation";
import type { AppConfig, LaunchTarget } from "../types/app-config";

const launchTargets: ReadonlySet<LaunchTarget> = new Set(["main", "pet"]);
const themes = new Set(["light", "dark", "system"]);

function parseLaunchTarget(value: unknown, field: string): LaunchTarget | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !launchTargets.has(value as LaunchTarget)) {
    throw new AppConfigInvalidError(`${field} must be "main" or "pet"`);
  }
  return value as LaunchTarget;
}

export function parseAppConfig(value: unknown): AppConfig {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) {
    throw new AppConfigInvalidError("App config must be an object");
  }

  const config: AppConfig = {};
  if (value.defaultPet !== undefined) {
    if (!isNonEmptyString(value.defaultPet)) {
      throw new AppConfigInvalidError("defaultPet must be a non-empty string");
    }
    config.defaultPet = value.defaultPet.trim();
  }

  config.launch = parseLaunchTarget(value.launch, "launch");
  config.autostart = parseLaunchTarget(value.autostart, "autostart");

  if (value.ui !== undefined) {
    if (!isRecord(value.ui)) {
      throw new AppConfigInvalidError("ui must be an object");
    }
    const ui: NonNullable<AppConfig["ui"]> = {};
    if (value.ui.theme !== undefined) {
      if (typeof value.ui.theme !== "string" || !themes.has(value.ui.theme)) {
        throw new AppConfigInvalidError("ui.theme is invalid");
      }
      ui.theme = value.ui.theme as NonNullable<AppConfig["ui"]>["theme"];
    }
    if (value.ui.locale !== undefined) {
      if (!isNonEmptyString(value.ui.locale)) {
        throw new AppConfigInvalidError("ui.locale must be a non-empty string");
      }
      ui.locale = value.ui.locale;
    }
    if (Object.keys(ui).length > 0) config.ui = ui;
  }

  return config;
}
