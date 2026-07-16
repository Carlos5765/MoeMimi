import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { StartReason } from "../types/app-config";

export interface WindowService {
  currentLabel(): string;
  startReason(): Promise<StartReason>;
  showMain(): Promise<void>;
  hideMain(): Promise<void>;
  showPet(petId?: string): Promise<void>;
  closePet(): Promise<void>;
  hidePet(): Promise<void>;
  exit(): Promise<void>;
}

class TauriWindowService implements WindowService {
  currentLabel(): string {
    return getCurrentWindow().label;
  }

  startReason(): Promise<StartReason> {
    return invoke("start_reason");
  }

  showMain(): Promise<void> {
    return invoke("show_main_window");
  }

  hideMain(): Promise<void> {
    return invoke("hide_main_window");
  }

  showPet(petId?: string): Promise<void> {
    return invoke("show_pet_window", { petId });
  }

  closePet(): Promise<void> {
    return invoke("close_pet_window");
  }

  hidePet(): Promise<void> {
    return invoke("hide_pet_window");
  }

  exit(): Promise<void> {
    return invoke("exit_app");
  }
}

class BrowserWindowService implements WindowService {
  currentLabel(): string {
    return new URLSearchParams(window.location.search).get("window") ?? "main";
  }

  async startReason(): Promise<StartReason> {
    return "manual";
  }

  async showMain(): Promise<void> {
    // The browser preview already displays the main window.
  }

  async hideMain(): Promise<void> {
    // Keep the browser preview open; only Tauri has separate native windows.
  }

  async showPet(petId?: string): Promise<void> {
    const parameters = new URLSearchParams({ window: "pet" });
    if (petId) parameters.set("petId", petId);
    window.open(`${window.location.origin}?${parameters}`, "moemimi-pet");
  }

  async closePet(): Promise<void> {
    window.close();
  }

  async hidePet(): Promise<void> {
    window.close();
  }

  async exit(): Promise<void> {
    window.close();
  }
}

export const windowService: WindowService = isTauri()
  ? new TauriWindowService()
  : new BrowserWindowService();
