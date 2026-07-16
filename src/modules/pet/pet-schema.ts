import {
  PetManifestInvalidError,
  UnsupportedSchemaVersionError,
} from "../../core/errors";
import { isNonEmptyString, isRecord } from "../../core/validation";
import type {
  Appearance,
  DialogueConfig,
  PetManifest,
} from "../../types/pet";

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new PetManifestInvalidError(`${label} contains unknown field: ${unknown}`);
  }
}

function parseAppearance(value: unknown): Appearance {
  if (!isRecord(value) || !isNonEmptyString(value.type)) {
    throw new PetManifestInvalidError("appearance must be a typed object");
  }

  if (value.type === "image") {
    rejectUnknownKeys(value, ["type", "source"], "image appearance");
    if (!isNonEmptyString(value.source)) {
      throw new PetManifestInvalidError("image appearance.source is required");
    }
    return { type: "image", source: value.source };
  }

  if (value.type === "live2d") {
    rejectUnknownKeys(
      value,
      ["type", "model", "fallbackImage", "actionCatalog"],
      "live2d appearance",
    );
    if (!isNonEmptyString(value.model)) {
      throw new PetManifestInvalidError("live2d appearance.model is required");
    }
    const appearance: Extract<Appearance, { type: "live2d" }> = {
      type: "live2d",
      model: value.model,
    };
    if (isNonEmptyString(value.fallbackImage)) {
      appearance.fallbackImage = value.fallbackImage;
    }
    if (isNonEmptyString(value.actionCatalog)) {
      appearance.actionCatalog = value.actionCatalog;
    }
    return appearance;
  }

  throw new PetManifestInvalidError(`unknown appearance type: ${value.type}`);
}

function parseDialogue(value: unknown): DialogueConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isNonEmptyString(value.type)) {
    throw new PetManifestInvalidError("dialogue must be a typed object");
  }

  if (value.type === "preset") {
    rejectUnknownKeys(value, ["type", "script"], "preset dialogue");
    if (!isNonEmptyString(value.script)) {
      throw new PetManifestInvalidError("preset dialogue.script is required");
    }
    return { type: "preset", script: value.script };
  }

  if (value.type === "llm") {
    rejectUnknownKeys(
      value,
      ["type", "profile", "prompt", "fallbackScript"],
      "llm dialogue",
    );
    if (!isNonEmptyString(value.profile) || !isNonEmptyString(value.prompt)) {
      throw new PetManifestInvalidError("llm profile and prompt are required");
    }
    const dialogue: Extract<DialogueConfig, { type: "llm" }> = {
      type: "llm",
      profile: value.profile,
      prompt: value.prompt,
    };
    if (isNonEmptyString(value.fallbackScript)) {
      dialogue.fallbackScript = value.fallbackScript;
    }
    return dialogue;
  }

  throw new PetManifestInvalidError(`unknown dialogue type: ${value.type}`);
}

export function parsePetManifest(value: unknown): PetManifest {
  if (!isRecord(value)) {
    throw new PetManifestInvalidError("pet manifest must be an object");
  }
  if (value.schemaVersion !== 1) {
    throw new UnsupportedSchemaVersionError("桌宠", value.schemaVersion);
  }
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name)) {
    throw new PetManifestInvalidError("pet id and name are required");
  }
  if (value.description !== undefined && typeof value.description !== "string") {
    throw new PetManifestInvalidError("description must be a string");
  }

  rejectUnknownKeys(
    value,
    ["schemaVersion", "id", "name", "description", "appearance", "dialogue"],
    "pet manifest",
  );

  const manifest: PetManifest = {
    schemaVersion: 1,
    id: value.id.trim(),
    name: value.name.trim(),
    appearance: parseAppearance(value.appearance),
  };
  if (value.description?.trim()) manifest.description = value.description.trim();
  const dialogue = parseDialogue(value.dialogue);
  if (dialogue) manifest.dialogue = dialogue;
  return manifest;
}
