import type {
  DialogueEngine,
  PetResponse,
  PresetDialogueEntry,
  PresetDialogueScript,
  UserTurn,
} from "../../types/dialogue";

function normalize(text: string): string {
  return text.trim().toLocaleLowerCase().replace(/[\s，。！？、,.!?]/g, "");
}

function choose(entries: PresetDialogueEntry[]): PresetDialogueEntry {
  return entries[Math.floor(Math.random() * entries.length)];
}

export class PresetDialogueEngine implements DialogueEngine {
  constructor(private readonly script: PresetDialogueScript) {}

  async respond(turn: UserTurn): Promise<PetResponse> {
    const input = normalize(turn.text ?? "");
    const matched = Object.entries(this.script.triggers).find(([trigger]) => {
      const normalizedTrigger = normalize(trigger);
      return input === normalizedTrigger || input.includes(normalizedTrigger);
    });
    const selected = choose(matched?.[1] ?? this.script.default);
    return {
      text: selected.text,
      ...(selected.voiceText ? { voiceText: selected.voiceText } : {}),
    };
  }
}
