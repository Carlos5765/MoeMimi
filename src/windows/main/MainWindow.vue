<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { autostartService } from "../../config/AutostartService";
import { appConfigRepository } from "../../config/AppConfigRepository";
import { toUserMessage } from "../../core/errors";
import { petRepository } from "../../modules/pet/PetRepository";
import type { AppConfig, LaunchTarget } from "../../types/app-config";
import type { ImagePetDraft, PetSummary } from "../../types/pet";
import { windowService } from "../../app/WindowService";

const props = defineProps<{ startupMessage?: string }>();

interface DisplayPet extends PetSummary {
  previewUrl?: string;
}

type BusyAction =
  | "loading"
  | "saving-pet"
  | "saving-settings"
  | "launching-pet"
  | "deleting-pet";

interface SettingsFeedback {
  kind: "success" | "error";
  message: string;
}

const emptyDraft = (): ImagePetDraft => ({
  mode: "create",
  id: "",
  name: "",
  description: "",
});

const config = ref<AppConfig>({});
const pets = ref<DisplayPet[]>([]);
const draft = reactive<ImagePetDraft>(emptyDraft());
const editorOpen = ref(false);
const busyActions = reactive(new Set<BusyAction>());
const notice = ref<string>();
const errorMessage = ref<string>();
const editorError = ref<string>();
const settingsFeedback = ref<SettingsFeedback>();
const pendingDeletePet = ref<DisplayPet>();
let savedAutostartConfigured = false;
let unlistenStartupError: UnlistenFn | undefined;
let unlistenPetReady: UnlistenFn | undefined;
let petReadyTimeout: number | undefined;
let noticeDismissTimeout: number | undefined;
let errorDismissTimeout: number | undefined;
let settingsFeedbackDismissTimeout: number | undefined;

const defaultPet = computed(() =>
  pets.value.find((pet) => pet.id === config.value.defaultPet),
);
const autostartConfigured = computed(() => config.value.autostart !== undefined);

function isBusy(action: BusyAction): boolean {
  return busyActions.has(action);
}

function withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), 8_000);
    operation.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function clearPetReadyTimeout(): void {
  if (petReadyTimeout !== undefined) window.clearTimeout(petReadyTimeout);
  petReadyTimeout = undefined;
}

function clearDismissTimeout(timeout: number | undefined): void {
  if (timeout !== undefined) window.clearTimeout(timeout);
}

watch(notice, (message) => {
  clearDismissTimeout(noticeDismissTimeout);
  noticeDismissTimeout = undefined;
  if (message && message !== "正在加载桌宠…") {
    noticeDismissTimeout = window.setTimeout(() => {
      notice.value = undefined;
      noticeDismissTimeout = undefined;
    }, 4_000);
  }
});

watch(errorMessage, (message) => {
  clearDismissTimeout(errorDismissTimeout);
  errorDismissTimeout = undefined;
  if (message) {
    errorDismissTimeout = window.setTimeout(() => {
      errorMessage.value = undefined;
      errorDismissTimeout = undefined;
    }, 8_000);
  }
});

watch(settingsFeedback, (feedback) => {
  clearDismissTimeout(settingsFeedbackDismissTimeout);
  settingsFeedbackDismissTimeout = undefined;
  if (feedback) {
    settingsFeedbackDismissTimeout = window.setTimeout(
      () => {
        settingsFeedback.value = undefined;
        settingsFeedbackDismissTimeout = undefined;
      },
      feedback.kind === "success" ? 4_000 : 8_000,
    );
  }
});

watch(
  () => props.startupMessage,
  (message) => {
    if (message) errorMessage.value = message;
  },
  { immediate: true },
);

function clearPreviewUrls(): void {
  for (const pet of pets.value) {
    if (pet.previewUrl) URL.revokeObjectURL(pet.previewUrl);
  }
}

async function refreshPets(): Promise<void> {
  const summaries = await petRepository.list();
  const displayPets = await Promise.all(
    summaries.map(async (pet) => ({
      ...pet,
      previewUrl: await petRepository.createPreviewUrl(pet.id),
    })),
  );
  clearPreviewUrls();
  pets.value = displayPets;
}

async function initialize(): Promise<void> {
  busyActions.add("loading");
  try {
    config.value = await appConfigRepository.load();
    savedAutostartConfigured = config.value.autostart !== undefined;
    await refreshPets();
  } catch (error) {
    console.error("Failed to initialize main window", error);
    errorMessage.value = toUserMessage(error);
  } finally {
    busyActions.delete("loading");
  }
}

function openCreateEditor(): void {
  Object.assign(draft, emptyDraft());
  editorError.value = undefined;
  editorOpen.value = true;
}

function openEditEditor(pet: DisplayPet): void {
  Object.assign(draft, {
    mode: "edit",
    id: pet.id,
    name: pet.name,
    description: pet.description ?? "",
    image: undefined,
  } satisfies ImagePetDraft);
  editorError.value = undefined;
  editorOpen.value = true;
}

function selectImage(event: Event): void {
  const input = event.target as HTMLInputElement;
  draft.image = input.files?.[0];
  editorError.value = undefined;
}

async function savePet(): Promise<void> {
  if (isBusy("saving-pet")) return;
  busyActions.add("saving-pet");
  editorError.value = undefined;
  try {
    await petRepository.saveImagePet(draft);
    await refreshPets();
    editorOpen.value = false;
    notice.value = draft.mode === "create" ? "静态桌宠已创建。" : "桌宠信息已更新。";
  } catch (error) {
    console.error("Failed to save pet", error);
    editorError.value = toUserMessage(error);
  } finally {
    busyActions.delete("saving-pet");
  }
}

async function setDefaultPet(petId: string): Promise<void> {
  config.value.defaultPet = petId;
  await appConfigRepository.save(config.value);
  notice.value = "默认桌宠已更新。";
}

function requestDeletePet(pet: DisplayPet): void {
  pendingDeletePet.value = pet;
}

function closeDeleteConfirmation(): void {
  if (!isBusy("deleting-pet")) pendingDeletePet.value = undefined;
}

async function confirmDeletePet(): Promise<void> {
  const pet = pendingDeletePet.value;
  if (!pet || isBusy("deleting-pet")) return;
  busyActions.add("deleting-pet");
  try {
    await petRepository.delete(pet.id);
    if (config.value.defaultPet === pet.id) {
      delete config.value.defaultPet;
      await appConfigRepository.save(config.value);
    }
    await refreshPets();
    pendingDeletePet.value = undefined;
    notice.value = "桌宠已删除。";
  } catch (error) {
    console.error("Failed to delete pet", error);
    errorMessage.value = toUserMessage(error);
  } finally {
    busyActions.delete("deleting-pet");
  }
}

function setAutostartConfigured(configured: boolean): void {
  settingsFeedback.value = undefined;
  if (configured) config.value.autostart = "pet";
  else delete config.value.autostart;
}

function setLaunch(value: Event): void {
  settingsFeedback.value = undefined;
  config.value.launch = (value.target as HTMLSelectElement).value as LaunchTarget;
}

function setAutostartTarget(value: Event): void {
  settingsFeedback.value = undefined;
  config.value.autostart = (value.target as HTMLSelectElement).value as LaunchTarget;
}

async function saveSettings(): Promise<void> {
  if (isBusy("saving-settings")) return;
  busyActions.add("saving-settings");
  settingsFeedback.value = undefined;
  try {
    const shouldAutostart = config.value.autostart !== undefined;
    if (shouldAutostart !== savedAutostartConfigured) {
      await withTimeout(
        autostartService.apply(shouldAutostart),
        "系统开机启动设置响应超时，请稍后重试。",
      );
    }
    await withTimeout(
      appConfigRepository.save(config.value),
      "启动配置保存超时，请稍后重试。",
    );
    savedAutostartConfigured = shouldAutostart;
    settingsFeedback.value = { kind: "success", message: "启动设置已保存。" };
  } catch (error) {
    console.error("Failed to save settings", error);
    settingsFeedback.value = {
      kind: "error",
      message: `启动设置保存失败：${toUserMessage(error)}`,
    };
  } finally {
    busyActions.delete("saving-settings");
  }
}

async function launchPet(): Promise<void> {
  if (!config.value.defaultPet) {
    errorMessage.value = "请先设置一个默认桌宠。";
    return;
  }
  if (isBusy("launching-pet")) return;
  busyActions.add("launching-pet");
  errorMessage.value = undefined;
  notice.value = "正在加载桌宠…";
  clearPetReadyTimeout();
  try {
    await withTimeout(
      windowService.showPet(config.value.defaultPet),
      "桌宠窗口创建超时，请重新启动 MoeMimi 后重试。",
    );
    if (notice.value === "正在加载桌宠…") {
      petReadyTimeout = window.setTimeout(() => {
        notice.value = undefined;
        errorMessage.value = "桌宠内容加载超时，请查看运行终端中的错误信息。";
        petReadyTimeout = undefined;
      }, 8_000);
    }
  } catch (error) {
    console.error("Failed to create pet window", error);
    notice.value = undefined;
    errorMessage.value = `桌宠启动失败：${toUserMessage(error)}`;
  } finally {
    busyActions.delete("launching-pet");
  }
}

onMounted(async () => {
  if (isTauri()) {
    unlistenStartupError = await listen<string>("startup-error", (event) => {
      clearPetReadyTimeout();
      notice.value = undefined;
      errorMessage.value = event.payload;
    });
    unlistenPetReady = await listen<string>("pet-ready", (event) => {
      clearPetReadyTimeout();
      notice.value = `桌宠“${event.payload}”已启动。`;
    });
  }
  await initialize();
});

onBeforeUnmount(() => {
  clearPreviewUrls();
  unlistenStartupError?.();
  unlistenPetReady?.();
  clearPetReadyTimeout();
  clearDismissTimeout(noticeDismissTimeout);
  clearDismissTimeout(errorDismissTimeout);
  clearDismissTimeout(settingsFeedbackDismissTimeout);
});
</script>

<template>
  <main class="main-window-shell">
    <header class="main-header">
      <div>
        <p class="brand-kicker">MODULAR DESKTOP PET</p>
        <h1>MoeMimi</h1>
        <p>管理桌宠资源、启动方式与本地预设对话。</p>
      </div>
      <div class="header-actions">
        <button class="button secondary" type="button" @click="windowService.exit">
          退出 MoeMimi
        </button>
        <button
          class="button primary"
          type="button"
          :disabled="isBusy('launching-pet')"
          @click="launchPet"
        >
          {{ isBusy("launching-pet") ? "启动中…" : "启动桌宠" }}
        </button>
      </div>
    </header>

    <Transition name="notification">
      <p v-if="errorMessage" :key="errorMessage" class="banner error-banner" role="alert">
        {{ errorMessage }}
        <button type="button" aria-label="关闭错误提示" @click="errorMessage = undefined">
          ×
        </button>
      </p>
    </Transition>
    <Transition name="notification">
      <p v-if="notice" :key="notice" class="banner success-banner" role="status">
        {{ notice }}
        <button type="button" aria-label="关闭成功提示" @click="notice = undefined">×</button>
      </p>
    </Transition>

    <section class="dashboard-grid">
      <article class="panel default-pet-panel">
        <div class="section-heading">
          <div>
            <p class="section-kicker">当前默认</p>
            <h2>{{ defaultPet?.name ?? "尚未设置" }}</h2>
          </div>
          <span class="status-dot" :class="{ active: defaultPet }"></span>
        </div>
        <div v-if="defaultPet" class="default-pet-content">
          <img v-if="defaultPet.previewUrl" :src="defaultPet.previewUrl" :alt="defaultPet.name" />
          <div>
            <p>{{ defaultPet.description ?? "这个桌宠还没有描述。" }}</p>
            <code>{{ defaultPet.id }}</code>
          </div>
        </div>
        <div v-else class="empty-state compact">
          <span>✦</span>
          <p>设置默认桌宠后即可从桌面启动。</p>
        </div>
      </article>

      <article class="panel settings-panel">
        <div class="section-heading">
          <div>
            <p class="section-kicker">启动设置</p>
            <h2>窗口行为</h2>
          </div>
        </div>
        <label class="field-row">
          <span>正常启动时</span>
          <select :value="config.launch ?? 'main'" @change="setLaunch">
            <option value="main">打开主界面</option>
            <option value="pet">打开默认桌宠</option>
          </select>
        </label>
        <label class="toggle-row">
          <span>
            <strong>开机自启动</strong>
            <small>取消后不会保留 autostart 配置对象</small>
          </span>
          <input
            type="checkbox"
            :checked="autostartConfigured"
            @change="setAutostartConfigured(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <label v-if="autostartConfigured" class="field-row">
          <span>开机启动时</span>
          <select :value="config.autostart" @change="setAutostartTarget">
            <option value="main">打开主界面</option>
            <option value="pet">打开默认桌宠</option>
          </select>
        </label>
        <Transition name="notification">
          <p
            v-if="settingsFeedback"
            :key="`${settingsFeedback.kind}:${settingsFeedback.message}`"
            class="settings-feedback"
            :class="settingsFeedback.kind"
            :role="settingsFeedback.kind === 'error' ? 'alert' : 'status'"
          >
            {{ settingsFeedback.message }}
          </p>
        </Transition>
        <button
          class="button settings-save"
          type="button"
          :disabled="isBusy('saving-settings')"
          @click="saveSettings"
        >
          {{ isBusy("saving-settings") ? "保存中…" : "保存启动设置" }}
        </button>
      </article>
    </section>

    <section class="panel library-panel">
      <div class="section-heading library-heading">
        <div>
          <p class="section-kicker">PET LIBRARY</p>
          <h2>桌宠列表</h2>
        </div>
        <span>{{ pets.length }} 个资源包</span>
      </div>

      <div v-if="isBusy('loading')" class="empty-state">正在读取桌宠资源…</div>
      <button
        v-else-if="pets.length === 0"
        class="empty-state empty-state-action"
        type="button"
        @click="openCreateEditor"
      >
        <span>＋</span>
        <p>还没有桌宠，点击这里创建一个。</p>
      </button>
      <div v-else class="pet-grid">
        <article v-for="pet in pets" :key="pet.id" class="pet-card">
          <div class="pet-preview">
            <img v-if="pet.previewUrl" :src="pet.previewUrl" :alt="pet.name" />
            <span v-else>{{ pet.name.slice(0, 1) }}</span>
            <span v-if="config.defaultPet === pet.id" class="default-badge">默认</span>
          </div>
          <div class="pet-card-body">
            <div>
              <h3>{{ pet.name }}</h3>
              <code>{{ pet.id }}</code>
            </div>
            <p>{{ pet.description ?? "暂无描述" }}</p>
            <div class="pet-actions">
              <button type="button" @click="openEditEditor(pet)">编辑</button>
              <button
                v-if="config.defaultPet !== pet.id"
                type="button"
                @click="setDefaultPet(pet.id)"
              >
                设为默认
              </button>
              <button class="danger-text" type="button" @click="requestDeletePet(pet)">
                删除
              </button>
            </div>
          </div>
        </article>
        <button class="pet-card add-pet-card" type="button" @click="openCreateEditor">
          <span>＋</span>
          <strong>创建静态桌宠</strong>
        </button>
      </div>
    </section>

    <footer class="main-footer">
      <span>配置和桌宠资源均保存在本机</span>
    </footer>

    <div v-if="editorOpen" class="modal-backdrop" @click.self="editorOpen = false">
      <form class="pet-editor" @submit.prevent="savePet">
        <div class="editor-heading">
          <div>
            <p class="section-kicker">IMAGE PET</p>
            <h2>{{ draft.mode === "create" ? "创建静态桌宠" : "编辑桌宠" }}</h2>
          </div>
          <button type="button" aria-label="关闭编辑器" @click="editorOpen = false">×</button>
        </div>
        <Transition name="notification">
          <p v-if="editorError" :key="editorError" class="editor-error" role="alert">
            {{ editorError }}
          </p>
        </Transition>
        <label>
          <span>资源标识（必填）</span>
          <input
            v-model.trim="draft.id"
            :disabled="draft.mode === 'edit'"
            maxlength="64"
            placeholder="例如 MoeMimi"
            required
          />
          <small>用于资源目录，可以使用中文；不能包含 / \ : * ? &quot; &lt; &gt; |，创建后不可修改。</small>
        </label>
        <label>
          <span>显示名称（必填）</span>
          <input v-model="draft.name" maxlength="60" placeholder="例如 MoeMimi" required />
        </label>
        <label>
          <span>描述（选填）</span>
          <textarea
            v-model="draft.description"
            rows="3"
            placeholder="例如 MoeMimi 的角色介绍"
          ></textarea>
        </label>
        <label class="file-field">
          <span>{{ draft.mode === "create" ? "静态图片（必填）" : "替换图片（选填）" }}</span>
          <input
            class="visually-hidden-file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            :aria-required="draft.mode === 'create'"
            @change="selectImage"
          />
          <span class="file-picker">
            <strong>选择图片</strong>
            <span>
              {{
                draft.image?.name ??
                (draft.mode === "create" ? "请选择静态图片" : "不选择则保留原图片")
              }}
            </span>
          </span>
        </label>
        <div class="editor-actions">
          <button class="button secondary" type="button" @click="editorOpen = false">取消</button>
          <button class="button primary" type="submit" :disabled="isBusy('saving-pet')">
            {{ isBusy("saving-pet") ? "保存中…" : "保存桌宠" }}
          </button>
        </div>
      </form>
    </div>

    <Transition name="modal">
      <div
        v-if="pendingDeletePet"
        class="modal-backdrop delete-modal-backdrop"
        @click.self="closeDeleteConfirmation"
      >
        <section
          class="delete-confirmation"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-description"
          tabindex="-1"
          @keydown.esc="closeDeleteConfirmation"
        >
          <span class="delete-warning-icon" aria-hidden="true">!</span>
          <p class="section-kicker">DELETE PET</p>
          <h2 id="delete-dialog-title">删除这个桌宠？</h2>
          <p id="delete-dialog-description">
            即将删除桌宠“<strong>{{ pendingDeletePet.name }}</strong>”及其本地资源文件。
          </p>
          <p class="delete-warning-text">此操作无法撤销。</p>
          <div class="delete-dialog-actions">
            <button
              class="button secondary"
              type="button"
              :disabled="isBusy('deleting-pet')"
              autofocus
              @click="closeDeleteConfirmation"
            >
              取消
            </button>
            <button
              class="button danger"
              type="button"
              :disabled="isBusy('deleting-pet')"
              @click="confirmDeletePet"
            >
              {{ isBusy("deleting-pet") ? "删除中…" : "确认删除" }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </main>
</template>
