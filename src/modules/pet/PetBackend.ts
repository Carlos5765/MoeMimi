import { invoke, isTauri } from "@tauri-apps/api/core";

export interface SaveImagePetInput {
  mode: "create" | "edit";
  id: string;
  name: string;
  description?: string;
  imageBytes?: number[];
  imageExtension?: string;
}

export interface PetBackend {
  ensurePetStorage(): Promise<void>;
  listPetIds(): Promise<string[]>;
  petFileExists(petId: string, relativePath: string): Promise<boolean>;
  readPetText(petId: string, relativePath: string): Promise<string>;
  readPetBinary(petId: string, relativePath: string): Promise<Uint8Array>;
  saveImagePet(input: SaveImagePetInput): Promise<void>;
  deletePet(petId: string): Promise<void>;
}

class TauriPetBackend implements PetBackend {
  ensurePetStorage(): Promise<void> {
    return invoke("ensure_pet_storage");
  }

  listPetIds(): Promise<string[]> {
    return invoke("list_pet_ids");
  }

  petFileExists(petId: string, relativePath: string): Promise<boolean> {
    return invoke("pet_file_exists", { petId, relativePath });
  }

  readPetText(petId: string, relativePath: string): Promise<string> {
    return invoke("read_pet_text", { petId, relativePath });
  }

  async readPetBinary(petId: string, relativePath: string): Promise<Uint8Array> {
    return new Uint8Array(
      await invoke<number[]>("read_pet_binary", { petId, relativePath }),
    );
  }

  saveImagePet(input: SaveImagePetInput): Promise<void> {
    return invoke("save_image_pet", { input });
  }

  deletePet(petId: string): Promise<void> {
    return invoke("delete_pet", { petId });
  }
}

const defaultDialogue = JSON.stringify(
  {
    default: [{ text: "嗯，我在。" }, { text: "今天想做什么？" }],
    triggers: {
      你好: [{ text: "你好。" }],
      晚安: [{ text: "晚安，早点休息。" }],
    },
  },
  null,
  2,
);

class BrowserPetBackend implements PetBackend {
  private readonly pets = new Map<string, Map<string, Uint8Array>>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  async ensurePetStorage(): Promise<void> {}

  async listPetIds(): Promise<string[]> {
    return [...this.pets.keys()];
  }

  async petFileExists(petId: string, relativePath: string): Promise<boolean> {
    return this.pets.get(petId)?.has(relativePath) ?? false;
  }

  async readPetText(petId: string, relativePath: string): Promise<string> {
    const value = this.pets.get(petId)?.get(relativePath);
    if (!value) throw new Error(`Missing browser demo file: ${relativePath}`);
    return this.decoder.decode(value);
  }

  async readPetBinary(petId: string, relativePath: string): Promise<Uint8Array> {
    const value = this.pets.get(petId)?.get(relativePath);
    if (!value) throw new Error(`Missing browser demo file: ${relativePath}`);
    return value.slice();
  }

  async saveImagePet(input: SaveImagePetInput): Promise<void> {
    const existing = this.pets.get(input.id);
    if (input.mode === "create" && existing) throw new Error("桌宠标识已存在");
    if (input.mode === "create" && !input.imageBytes) throw new Error("请选择图片");

    const files = existing ?? new Map<string, Uint8Array>();
    let source = "avatar.png";
    if (existing) {
      const manifest = JSON.parse(this.decoder.decode(existing.get("pet.json")));
      source = String(manifest.appearance.source).replace(/^\.\//, "");
    }
    if (input.imageBytes && input.imageExtension) {
      source = `avatar.${input.imageExtension}`;
      files.set(source, new Uint8Array(input.imageBytes));
    }
    files.set(
      "pet.json",
      this.encoder.encode(
        JSON.stringify(
          {
            schemaVersion: 1,
            id: input.id,
            name: input.name,
            ...(input.description ? { description: input.description } : {}),
            appearance: { type: "image", source: `./${source}` },
            dialogue: { type: "preset", script: "./dialogue.json" },
          },
          null,
          2,
        ),
      ),
    );
    if (!files.has("dialogue.json")) {
      files.set("dialogue.json", this.encoder.encode(defaultDialogue));
    }
    this.pets.set(input.id, files);
  }

  async deletePet(petId: string): Promise<void> {
    this.pets.delete(petId);
  }
}

export const petBackend: PetBackend = isTauri()
  ? new TauriPetBackend()
  : new BrowserPetBackend();
