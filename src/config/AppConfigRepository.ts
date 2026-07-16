import { isTauri } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import { parseAppConfig } from "./app-config-schema";
import type { AppConfig } from "../types/app-config";

export interface AppConfigRepository {
  load(): Promise<AppConfig>;
  save(config: AppConfig): Promise<void>;
}

const storePath = "app-config.json";
const storeKey = "config";

class TauriAppConfigRepository implements AppConfigRepository {
  private store?: Promise<Store>;

  private getStore(): Promise<Store> {
    this.store ??= load(storePath, { defaults: {}, autoSave: false });
    return this.store;
  }

  async load(): Promise<AppConfig> {
    const store = await this.getStore();
    return parseAppConfig(await store.get<unknown>(storeKey));
  }

  async save(config: AppConfig): Promise<void> {
    const validated = parseAppConfig(config);
    const store = await this.getStore();
    await store.set(storeKey, validated);
    await store.save();
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
