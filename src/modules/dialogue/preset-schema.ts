import { PetManifestInvalidError } from "../../core/errors";
import { isNonEmptyString, isRecord } from "../../core/validation";
import type {
  PresetDialogueEntry,
  PresetDialogueScript,
} from "../../types/dialogue";

function parseEntries(value: unknown, label: string): PresetDialogueEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PetManifestInvalidError(`${label} must be a non-empty array`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry) || !isNonEmptyString(entry.text)) {
      throw new PetManifestInvalidError(`${label}[${index}].text is required`);
    }
    if (entry.voiceText !== undefined && !isNonEmptyString(entry.voiceText)) {
      throw new PetManifestInvalidError(`${label}[${index}].voiceText is invalid`);
    }
    return {
      text: entry.text,
      ...(entry.voiceText ? { voiceText: entry.voiceText } : {}),
    };
  });
}

export function parsePresetDialogueScript(value: unknown): PresetDialogueScript {
  if (!isRecord(value) || !isRecord(value.triggers)) {
    throw new PetManifestInvalidError(
      "preset dialogue must contain default and triggers",
    );
  }

  const triggers: Record<string, PresetDialogueEntry[]> = {};
  for (const [trigger, entries] of Object.entries(value.triggers)) {
    if (!trigger.trim()) {
      throw new PetManifestInvalidError("dialogue trigger cannot be empty");
    }
    triggers[trigger] = parseEntries(entries, `triggers.${trigger}`);
  }

  return {
    default: parseEntries(value.default, "default"),
    triggers,
  };
}
