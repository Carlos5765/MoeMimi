import { invoke, isTauri } from "@tauri-apps/api/core";
import { parseAppConfig } from "./app-config-schema";
import type { AppConfig } from "../types/app-config";

export interface AppConfigRepository {
  load(): Promise<AppConfig>;
  save(config: AppConfig): Promise<void>;
}

class TauriAppConfigRepository implements AppConfigRepository {
  async load(): Promise<AppConfig> {
    return parseAppConfig(await invoke<unknown>("read_app_config"));
  }

  async save(config: AppConfig): Promise<void> {
    const validated = parseAppConfig(config);
    await invoke("write_app_config", { config: validated });
  }
}

class BrowserAppConfigRepository implements AppConfigRepository {
  private config: AppConfig = {};

  async load(): Promise<AppConfig> {
    return structuredClone(this.config);
  }

  async save(config: AppConfig): Promise<void> {
    this.config = structuredClone(parseAppConfig(config));
  }
}

export const appConfigRepository: AppConfigRepository = isTauri()
  ? new TauriAppConfigRepository()
  : new BrowserAppConfigRepository();
