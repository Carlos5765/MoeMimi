export interface UserTurn {
  text?: string;
  actions?: UserAction[];
}

export interface UserAction {
  id: string;
  rawText: string;
}

export interface PetResponse {
  text: string;
  voiceText?: string;
  actions?: PetActionCommand[];
}

export interface PetActionCommand {
  id: string;
  delayMs?: number;
  durationMs?: number;
  intensity?: number;
}

export interface DialogueEngine {
  respond(turn: UserTurn): Promise<PetResponse>;
}

export interface PresetDialogueEntry {
  text: string;
  voiceText?: string;
}

export interface PresetDialogueScript {
  default: PresetDialogueEntry[];
  triggers: Record<string, PresetDialogueEntry[]>;
}
