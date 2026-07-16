import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CharacterRenderer } from "../../types/pet";

export class ImageRenderer implements CharacterRenderer {
  private image?: HTMLImageElement;
  private objectUrl?: string;
  private visible = true;
  private dragDelay?: number;

  constructor(
    private readonly petName: string,
    private readonly sourceName: string,
    private readonly loadBytes: () => Promise<Uint8Array>,
  ) {}

  async mount(container: HTMLElement): Promise<void> {
    this.destroy();
    const bytes = await this.loadBytes();
    const extension = this.sourceName.split(".").pop()?.toLowerCase();
    const mime = extension === "svg" ? "image/svg+xml" : `image/${extension ?? "png"}`;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    this.objectUrl = URL.createObjectURL(new Blob([copy.buffer], { type: mime }));

    const image = document.createElement("img");
    image.className = "pet-character-image";
    image.alt = this.petName;
    image.draggable = false;
    image.hidden = !this.visible;
    image.addEventListener("pointerdown", this.handlePointerDown);
    image.addEventListener("pointerup", this.cancelPendingDrag);
    image.addEventListener("pointercancel", this.cancelPendingDrag);

    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener(
        "error",
        () => reject(new Error(`无法加载桌宠图片：${this.sourceName}`)),
        { once: true },
      );
      image.src = this.objectUrl!;
    });
    container.replaceChildren(image);
    this.image = image;
  }

  show(): void {
    this.visible = true;
    if (this.image) this.image.hidden = false;
  }

  hide(): void {
    this.visible = false;
    if (this.image) this.image.hidden = true;
  }

  destroy(): void {
    this.cancelPendingDrag();
    if (this.image) {
      this.image.removeEventListener("pointerdown", this.handlePointerDown);
      this.image.removeEventListener("pointerup", this.cancelPendingDrag);
      this.image.removeEventListener("pointercancel", this.cancelPendingDrag);
      this.image.remove();
      this.image = undefined;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.cancelPendingDrag();
    this.dragDelay = window.setTimeout(() => {
      this.dragDelay = undefined;
      void getCurrentWindow().startDragging().catch((error: unknown) => {
        console.debug("Window dragging is unavailable in this environment", error);
      });
    }, 140);
  };

  private readonly cancelPendingDrag = (): void => {
    if (this.dragDelay !== undefined) window.clearTimeout(this.dragDelay);
    this.dragDelay = undefined;
  };
}
