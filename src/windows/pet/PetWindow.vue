<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { appConfigRepository } from "../../config/AppConfigRepository";
import { toUserMessage } from "../../core/errors";
import { petLoader } from "../../modules/pet/PetLoader";
import { PetRuntime } from "../../runtime/PetRuntime";
import { windowService } from "../../app/WindowService";
import {
  fitWithin,
  resizeKeepingAspect,
  type WindowSize,
} from "./pet-window-layout";

type DialogueState = "closed" | "idle" | "typing" | "sending";
type WindowMode = "image" | "menu" | "dialogue";

const MAX_IMAGE_SIZE: WindowSize = { width: 420, height: 500 };
const MENU_SIZE: WindowSize = { width: 196, height: 176 };
const DIALOGUE_WIDTH = 440;
const DIALOGUE_HEIGHT = 224;
const EDGE_GAP = 8;
const MAX_RESIZED_IMAGE_WIDTH = 900;
const MINIMUM_IMAGE_EDGE = 96;

const rendererHost = ref<HTMLElement>();
const contextMenuElement = ref<HTMLElement>();
const dialogueState = ref<DialogueState>("closed");
const input = ref("");
const speakerName = ref("Mimi");
const fullText = ref("");
const displayedText = ref("");
const contextMenu = ref<{ x: number; y: number }>();
const loadError = ref<string>();
const imageSize = ref<WindowSize>({ width: 420, height: 420 });
const resizeBounds = ref<WindowSize>({ width: MAX_RESIZED_IMAGE_WIDTH, height: 700 });
const resizing = ref(false);
let runtime: PetRuntime | undefined;
let typingTimer: number | undefined;
let blurDismissTimer: number | undefined;
let resizeFrame: number | undefined;
let layoutRequestId = 0;
let latestRequestedWindowSize: WindowSize = { width: 420, height: 420 };
let resizeStart:
  | {
      screenX: number;
      screenY: number;
      size: WindowSize;
    }
  | undefined;
let unlistenLoadPet: UnlistenFn | undefined;

declare global {
  interface Window {
    __MOEMIMI_PET_ID__?: string;
  }
}

function clearTypingTimer(): void {
  if (typingTimer !== undefined) window.clearInterval(typingTimer);
  typingTimer = undefined;
}

function startTyping(text: string): void {
  clearTypingTimer();
  fullText.value = text;
  displayedText.value = "";
  dialogueState.value = "typing";
  let index = 0;
  typingTimer = window.setInterval(() => {
    index += 1;
    displayedText.value = text.slice(0, index);
    if (index >= text.length) {
      clearTypingTimer();
      dialogueState.value = "idle";
    }
  }, 34);
}

function completeTyping(): void {
  if (dialogueState.value !== "typing") return;
  clearTypingTimer();
  displayedText.value = fullText.value;
  dialogueState.value = "idle";
}

function sizeForMode(mode: WindowMode): WindowSize {
  if (mode === "dialogue") {
    return {
      width: Math.max(imageSize.value.width, DIALOGUE_WIDTH),
      height: imageSize.value.height + DIALOGUE_HEIGHT,
    };
  }
  if (mode === "menu") {
    return {
      width: Math.max(imageSize.value.width, MENU_SIZE.width),
      height: Math.max(imageSize.value.height, MENU_SIZE.height),
    };
  }
  return imageSize.value;
}

function updateLayoutVariables(size: WindowSize): void {
  const root = document.documentElement;
  root.style.setProperty("--pet-image-width", `${imageSize.value.width}px`);
  root.style.setProperty("--pet-image-height", `${imageSize.value.height}px`);
  root.style.setProperty("--pet-window-width", `${size.width}px`);
}

async function applyWindowMode(mode: WindowMode): Promise<WindowSize> {
  const size = sizeForMode(mode);
  const requestId = ++layoutRequestId;
  latestRequestedWindowSize = size;
  updateLayoutVariables(size);
  if (!isTauri()) return size;

  const petWindow = getCurrentWindow();
  await petWindow.setSize(new LogicalSize(size.width, size.height));
  if (requestId !== layoutRequestId) {
    const latest = latestRequestedWindowSize;
    await petWindow.setSize(new LogicalSize(latest.width, latest.height));
    return latest;
  }

  const [position, monitor, scaleFactor] = await Promise.all([
    petWindow.outerPosition(),
    currentMonitor(),
    petWindow.scaleFactor(),
  ]);
  if (!monitor) return size;
  if (requestId !== layoutRequestId) {
    const latest = latestRequestedWindowSize;
    await petWindow.setSize(new LogicalSize(latest.width, latest.height));
    return latest;
  }

  const workArea = monitor.workArea;
  const physicalWidth = Math.round(size.width * scaleFactor);
  const physicalHeight = Math.round(size.height * scaleFactor);
  const minimumX = workArea.position.x;
  const minimumY = workArea.position.y;
  const maximumX = minimumX + Math.max(0, workArea.size.width - physicalWidth);
  const maximumY = minimumY + Math.max(0, workArea.size.height - physicalHeight);
  const nextX = Math.min(Math.max(position.x, minimumX), maximumX);
  const nextY = Math.min(Math.max(position.y, minimumY), maximumY);

  if (nextX !== position.x || nextY !== position.y) {
    await petWindow.setPosition(new PhysicalPosition(nextX, nextY));
  }
  return size;
}

function resolveImageSize(): WindowSize {
  const image = rendererHost.value?.querySelector<HTMLImageElement>(".pet-character-image");
  if (!image || image.naturalWidth < 1 || image.naturalHeight < 1) {
    return { width: 420, height: 420 };
  }
  return fitWithin(
    { width: image.naturalWidth, height: image.naturalHeight },
    MAX_IMAGE_SIZE,
  );
}

function activeWindowMode(): WindowMode {
  if (dialogueState.value !== "closed") return "dialogue";
  if (contextMenu.value) return "menu";
  return "image";
}

async function refreshResizeBounds(): Promise<void> {
  if (!isTauri()) {
    resizeBounds.value = {
      width: Math.max(160, Math.min(MAX_RESIZED_IMAGE_WIDTH, window.screen.availWidth - 16)),
      height: Math.max(160, window.screen.availHeight - DIALOGUE_HEIGHT - 16),
    };
    return;
  }
  const monitor = await currentMonitor();
  if (!monitor) return;
  resizeBounds.value = {
    width: Math.max(
      160,
      Math.min(MAX_RESIZED_IMAGE_WIDTH, monitor.workArea.size.width / monitor.scaleFactor - 16),
    ),
    height: Math.max(
      160,
      monitor.workArea.size.height / monitor.scaleFactor - DIALOGUE_HEIGHT - 16,
    ),
  };
}

function scheduleResizeLayout(): void {
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = undefined;
    void applyWindowMode(activeWindowMode()).catch((error: unknown) => {
      console.error("Failed to resize pet window", error);
    });
  });
}

function startImageResize(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  contextMenu.value = undefined;
  resizing.value = true;
  resizeStart = {
    screenX: event.screenX,
    screenY: event.screenY,
    size: { ...imageSize.value },
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  void refreshResizeBounds();
}

function moveImageResize(event: PointerEvent): void {
  if (!resizing.value || !resizeStart) return;
  event.preventDefault();
  imageSize.value = resizeKeepingAspect(
    resizeStart.size,
    event.screenX - resizeStart.screenX,
    event.screenY - resizeStart.screenY,
    resizeBounds.value,
    MINIMUM_IMAGE_EDGE,
  );
  updateLayoutVariables(sizeForMode(activeWindowMode()));
  scheduleResizeLayout();
}

function stopImageResize(): void {
  if (!resizing.value) return;
  resizing.value = false;
  resizeStart = undefined;
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
  resizeFrame = undefined;
  void applyWindowMode(activeWindowMode()).catch((error: unknown) => {
    console.error("Failed to finish resizing pet window", error);
  });
}

async function closeContextMenu(resize = true): Promise<void> {
  if (!contextMenu.value) return;
  contextMenu.value = undefined;
  if (resize) {
    await applyWindowMode(dialogueState.value === "closed" ? "image" : "dialogue");
  }
}

async function toggleDialogue(): Promise<void> {
  contextMenu.value = undefined;
  if (dialogueState.value === "closed") {
    dialogueState.value = "idle";
    await applyWindowMode("dialogue");
    if (!displayedText.value && runtime) {
      const response = await runtime.respond({});
      startTyping(response.text);
    }
    await nextTick();
    return;
  }
  clearTypingTimer();
  dialogueState.value = "closed";
  await applyWindowMode("image");
}

async function send(): Promise<void> {
  const text = input.value.trim();
  if (!text || dialogueState.value === "sending" || !runtime) return;
  completeTyping();
  dialogueState.value = "sending";
  try {
    const response = await runtime.respond({ text });
    input.value = "";
    startTyping(response.text);
  } catch (error) {
    console.error("Preset dialogue failed", error);
    startTyping(toUserMessage(error));
  }
}

function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void send();
  }
}

async function openContextMenu(event: MouseEvent): Promise<void> {
  event.preventDefault();
  contextMenu.value = { x: 0, y: 0 };
  const windowSize = await applyWindowMode(
    dialogueState.value === "closed" ? "menu" : "dialogue",
  );
  await nextTick();

  const menuRect = contextMenuElement.value?.getBoundingClientRect();
  const menuWidth = menuRect?.width ?? 180;
  const menuHeight = menuRect?.height ?? 156;
  contextMenu.value = {
    x: Math.min(
      Math.max(event.clientX, EDGE_GAP),
      Math.max(EDGE_GAP, windowSize.width - menuWidth - EDGE_GAP),
    ),
    y: Math.min(
      Math.max(event.clientY, EDGE_GAP),
      Math.max(EDGE_GAP, windowSize.height - menuHeight - EDGE_GAP),
    ),
  };
}

function handleOutsidePointerDown(event: PointerEvent): void {
  if (!contextMenu.value) return;
  const target = event.target;
  if (target instanceof Node && contextMenuElement.value?.contains(target)) return;
  void closeContextMenu();
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") void closeContextMenu();
}

function handleWindowBlur(): void {
  if (blurDismissTimer !== undefined) window.clearTimeout(blurDismissTimer);
  blurDismissTimer = window.setTimeout(() => {
    blurDismissTimer = undefined;
    if (!document.hasFocus()) void closeContextMenu();
  }, 150);
}

function handleWindowFocus(): void {
  if (blurDismissTimer !== undefined) window.clearTimeout(blurDismissTimer);
  blurDismissTimer = undefined;
}

async function openMainWindow(): Promise<void> {
  await closeContextMenu();
  await windowService.showMain();
}

async function closePet(): Promise<void> {
  contextMenu.value = undefined;
  clearTypingTimer();
  dialogueState.value = "closed";
  await windowService.closePet();
}

async function loadPet(petId: string): Promise<void> {
  clearTypingTimer();
  contextMenu.value = undefined;
  dialogueState.value = "closed";
  displayedText.value = "";
  fullText.value = "";
  input.value = "";
  loadError.value = undefined;
  runtime?.destroy();
  runtime = undefined;

  const pet = await petLoader.load(petId);
  const nextRuntime = new PetRuntime(pet);
  await nextTick();
  if (!rendererHost.value) throw new Error("桌宠渲染容器不存在");
  await nextRuntime.mount(rendererHost.value);
  runtime = nextRuntime;
  speakerName.value = pet.name;
  imageSize.value = resolveImageSize();
  await refreshResizeBounds();
  await applyWindowMode("image");
  if (isTauri()) {
    await emitTo("main", "pet-ready", pet.name);
    await windowService.hideMain();
  }
}

async function failToMain(error: unknown): Promise<void> {
  console.error("Failed to initialize pet window", error);
  const message = `桌宠加载失败：${toUserMessage(error)}`;
  loadError.value = message;
  if (isTauri()) await emitTo("main", "startup-error", message);
  await windowService.showMain();
  await windowService.hidePet();
}

onMounted(async () => {
  window.addEventListener("pointerdown", handleOutsidePointerDown, true);
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("pointermove", moveImageResize);
  window.addEventListener("pointerup", stopImageResize);
  window.addEventListener("pointercancel", stopImageResize);
  try {
    if (isTauri()) {
      unlistenLoadPet = await listen<string>("load-pet", (event) => {
        void loadPet(event.payload).catch(failToMain);
      });
    }
    const requestedPetId =
      window.__MOEMIMI_PET_ID__ ?? new URLSearchParams(window.location.search).get("petId");
    const petId = requestedPetId ?? (await appConfigRepository.load()).defaultPet;
    if (!petId) throw new Error("尚未设置默认桌宠");
    await loadPet(petId);
  } catch (error) {
    await failToMain(error);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("focus", handleWindowFocus);
  window.removeEventListener("pointermove", moveImageResize);
  window.removeEventListener("pointerup", stopImageResize);
  window.removeEventListener("pointercancel", stopImageResize);
  if (blurDismissTimer !== undefined) window.clearTimeout(blurDismissTimer);
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
  unlistenLoadPet?.();
  clearTypingTimer();
  runtime?.destroy();
});
</script>

<template>
  <main class="pet-window-shell" :class="{ 'is-resizing': resizing }">
    <div
      ref="rendererHost"
      class="pet-renderer-host"
      title="按住拖动；双击打开对话"
      @dblclick.stop="toggleDialogue"
      @contextmenu.stop="openContextMenu"
    ></div>

    <button
      class="pet-resize-handle"
      type="button"
      aria-label="拖动调整桌宠大小"
      title="拖动调整桌宠大小"
      @pointerdown="startImageResize"
      @lostpointercapture="stopImageResize"
      @contextmenu.prevent.stop
    ></button>

    <section
      v-if="dialogueState !== 'closed'"
      class="galgame-dialogue"
      aria-label="桌宠对话"
      @click.stop="completeTyping"
      @contextmenu.stop="openContextMenu"
    >
      <div class="speaker-name">{{ speakerName }}</div>
      <div class="dialogue-text" aria-live="polite">
        {{ dialogueState === "sending" ? "……" : displayedText }}
        <span v-if="dialogueState === 'typing'" class="typing-caret"></span>
      </div>
      <div class="dialogue-input-row" @click.stop>
        <textarea
          v-model="input"
          rows="2"
          placeholder="输入想说的话…"
          :disabled="dialogueState === 'sending'"
          @keydown="handleInputKeydown"
        ></textarea>
        <button
          type="button"
          :disabled="!input.trim() || dialogueState === 'sending'"
          @click="send"
        >
          发送
        </button>
      </div>
    </section>

    <nav
      v-if="contextMenu"
      ref="contextMenuElement"
      class="pet-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
    >
      <button type="button" @click="toggleDialogue">
        {{ dialogueState === "closed" ? "打开对话" : "关闭对话" }}
      </button>
      <button type="button" @click="openMainWindow">打开主界面</button>
      <button type="button" @click="closePet">关闭桌宠</button>
      <button class="danger-text" type="button" @click="windowService.exit">退出 MoeMimi</button>
    </nav>

    <p v-if="loadError" class="pet-load-error">{{ loadError }}</p>
  </main>
</template>
