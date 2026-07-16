import { isTauri } from "@tauri-apps/api/core";
import { disable, enable } from "@tauri-apps/plugin-autostart";

export interface AutostartService {
  apply(configured: boolean): Promise<void>;
}

class TauriAutostartService implements AutostartService {
  async apply(configured: boolean): Promise<void> {
    if (configured) await enable();
    else await disable();
  }
}

class BrowserAutostartService implements AutostartService {
  async apply(): Promise<void> {
    // Browser preview has no operating-system autostart integration.
  }
}

export const autostartService: AutostartService = isTauri()
  ? new TauriAutostartService()
  : new BrowserAutostartService();
