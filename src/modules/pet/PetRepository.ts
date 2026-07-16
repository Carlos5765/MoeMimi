import {
  PetAssetNotFoundError,
  PetManifestInvalidError,
  PetNotFoundError,
} from "../../core/errors";
import { parseJson, resolvePetRelativePath } from "../../core/validation";
import type { ImagePetDraft, PetManifest, PetSummary } from "../../types/pet";
import { petBackend, type PetBackend } from "./PetBackend";
import { parsePetManifest } from "./pet-schema";

function mimeType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
    }[extension ?? ""] ?? "application/octet-stream"
  );
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function validatePetId(id: string): void {
  const forbiddenPathCharacter = /[<>:"/\\|?*\u0000-\u001f]/;
  const reservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  const characterCount = [...id].length;
  if (!id) throw new Error("资源标识为必填项。");
  if (characterCount > 64) throw new Error("资源标识不能超过 64 个字符。");
  if (
    id !== id.trim() ||
    id === "." ||
    id === ".." ||
    id.endsWith(".") ||
    id.endsWith(" ") ||
    forbiddenPathCharacter.test(id) ||
    reservedWindowsName.test(id)
  ) {
    throw new Error(
      '资源标识不可包含非法字符 < > : " / \\ | ? *，也不能使用 Windows 保留名称。',
    );
  }
}

export class PetRepository {
  constructor(private readonly backend: PetBackend = petBackend) {}

  ensurePetStorage(): Promise<void> {
    return this.backend.ensurePetStorage();
  }

  async hasPet(petId: string): Promise<boolean> {
    return (await this.backend.listPetIds()).includes(petId);
  }

  async loadManifest(petId: string): Promise<PetManifest> {
    if (!(await this.hasPet(petId))) throw new PetNotFoundError(petId);
    let raw: unknown;
    try {
      raw = parseJson(await this.backend.readPetText(petId, "pet.json"), "pet.json");
    } catch (error) {
      throw new PetManifestInvalidError("pet.json is invalid JSON", { cause: error });
    }
    const manifest = parsePetManifest(raw);
    if (manifest.id !== petId) {
      throw new PetManifestInvalidError(
        `manifest id ${manifest.id} does not match directory ${petId}`,
      );
    }
    return manifest;
  }

  async list(): Promise<PetSummary[]> {
    const ids = await this.backend.listPetIds();
    return Promise.all(
      ids.map(async (id) => {
        const manifest = await this.loadManifest(id);
        return {
          id,
          name: manifest.name,
          description: manifest.description,
          appearanceType: manifest.appearance.type,
        };
      }),
    );
  }

  async readAsset(petId: string, path: string): Promise<Uint8Array> {
    const relativePath = resolvePetRelativePath(path);
    if (!(await this.backend.petFileExists(petId, relativePath))) {
      throw new PetAssetNotFoundError(petId, relativePath);
    }
    return this.backend.readPetBinary(petId, relativePath);
  }

  async readTextAsset(petId: string, path: string): Promise<string> {
    const relativePath = resolvePetRelativePath(path);
    if (!(await this.backend.petFileExists(petId, relativePath))) {
      throw new PetAssetNotFoundError(petId, relativePath);
    }
    return this.backend.readPetText(petId, relativePath);
  }

  async createPreviewUrl(petId: string): Promise<string | undefined> {
    const manifest = await this.loadManifest(petId);
    const source =
      manifest.appearance.type === "image"
        ? manifest.appearance.source
        : manifest.appearance.fallbackImage;
    if (!source) return undefined;
    const bytes = await this.readAsset(petId, source);
    return URL.createObjectURL(
      new Blob([copyToArrayBuffer(bytes)], { type: mimeType(source) }),
    );
  }

  async saveImagePet(draft: ImagePetDraft): Promise<void> {
    const petId = draft.id.trim();
    validatePetId(petId);
    if (!draft.name.trim()) throw new Error("桌宠名称不能为空");
    if (draft.mode === "create" && !draft.image) throw new Error("请选择静态图片");

    let imageBytes: number[] | undefined;
    let imageExtension: string | undefined;
    if (draft.image) {
      if (!draft.image.type.startsWith("image/")) throw new Error("请选择图片文件");
      if (draft.image.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10 MB");
      imageBytes = Array.from(new Uint8Array(await draft.image.arrayBuffer()));
      imageExtension = draft.image.name.split(".").pop()?.toLowerCase() || "png";
    }

    await this.backend.saveImagePet({
      mode: draft.mode,
      id: petId,
      name: draft.name.trim(),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      ...(imageBytes ? { imageBytes } : {}),
      ...(imageExtension ? { imageExtension } : {}),
    });
  }

  delete(petId: string): Promise<void> {
    return this.backend.deletePet(petId);
  }
}

export const petRepository = new PetRepository();
