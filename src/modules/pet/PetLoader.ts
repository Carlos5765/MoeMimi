import {
  PetManifestInvalidError,
  UnsupportedPetFeatureError,
} from "../../core/errors";
import { parseJson } from "../../core/validation";
import type { ResolvedPet } from "../../types/pet";
import { PresetDialogueEngine } from "../dialogue/PresetDialogueEngine";
import { parsePresetDialogueScript } from "../dialogue/preset-schema";
import { ImageRenderer } from "../renderer/ImageRenderer";
import { PetRepository, petRepository } from "./PetRepository";

export class PetLoader {
  constructor(private readonly repository: PetRepository = petRepository) {}

  async load(petId: string): Promise<ResolvedPet> {
    const manifest = await this.repository.loadManifest(petId);
    if (manifest.appearance.type === "live2d") {
      // TODO(phase-2): construct a Live2D renderer from model/actionCatalog.
      throw new UnsupportedPetFeatureError("Live2D");
    }

    const imageSource = manifest.appearance.source;
    const renderer = new ImageRenderer(
      manifest.name,
      imageSource,
      () => this.repository.readAsset(petId, imageSource),
    );

    let dialogue;
    if (manifest.dialogue?.type === "preset") {
      let raw: unknown;
      try {
        raw = parseJson(
          await this.repository.readTextAsset(petId, manifest.dialogue.script),
          "dialogue.json",
        );
      } catch (error) {
        throw new PetManifestInvalidError("dialogue script is invalid JSON", {
          cause: error,
        });
      }
      dialogue = new PresetDialogueEngine(parsePresetDialogueScript(raw));
    } else if (manifest.dialogue?.type === "llm") {
      // TODO(phase-2): resolve an LLM engine and optional preset fallback.
      throw new UnsupportedPetFeatureError("LLM 对话");
    }

    return {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      renderer,
      dialogue,
    };
  }
}

export const petLoader = new PetLoader();
