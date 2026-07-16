import type { DialogueEngine, PetActionCommand } from "./dialogue";

export type Appearance =
  | {
      type: "image";
      source: string;
    }
  | {
      type: "live2d";
      model: string;
      fallbackImage?: string;
      actionCatalog?: string;
    };

export type DialogueConfig =
  | {
      type: "preset";
      script: string;
    }
  | {
      type: "llm";
      profile: string;
      prompt: string;
      fallbackScript?: string;
    };

export interface PetManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  appearance: Appearance;
  dialogue?: DialogueConfig;
}

export interface CharacterRenderer {
  mount(container: HTMLElement): Promise<void>;
  show(): void;
  hide(): void;
  destroy(): void;
  executeAction?(action: PetActionCommand): Promise<void>;
  setMouthOpen?(value: number): void;
}

export interface ResolvedPet {
  id: string;
  name: string;
  description?: string;
  renderer: CharacterRenderer;
  dialogue?: DialogueEngine;
}

export interface PetSummary {
  id: string;
  name: string;
  description?: string;
  appearanceType: Appearance["type"];
  previewUrl?: string;
}

export interface ImagePetDraft {
  mode: "create" | "edit";
  id: string;
  name: string;
  description: string;
  image?: File;
}
