import type { PetResponse, UserTurn } from "../types/dialogue";
import type { ResolvedPet } from "../types/pet";

export class PetRuntime {
  constructor(public readonly pet: ResolvedPet) {}

  mount(container: HTMLElement): Promise<void> {
    return this.pet.renderer.mount(container);
  }

  async respond(turn: UserTurn): Promise<PetResponse> {
    if (!this.pet.dialogue) return { text: "这个桌宠还没有配置对话。" };
    return this.pet.dialogue.respond(turn);
  }

  destroy(): void {
    this.pet.renderer.destroy();
  }
}
