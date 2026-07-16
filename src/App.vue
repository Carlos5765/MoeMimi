<script setup lang="ts">
import { onMounted, ref } from "vue";
import { startupController } from "./app/StartupController";
import { windowService } from "./app/WindowService";
import MainWindow from "./windows/main/MainWindow.vue";
import PetWindow from "./windows/pet/PetWindow.vue";

const windowLabel = windowService.currentLabel();
const startupMessage = ref<string>();
const startupComplete = ref(windowLabel === "pet");

onMounted(async () => {
  if (windowLabel === "main") {
    startupMessage.value = await startupController.start();
    startupComplete.value = true;
  }
});
</script>

<template>
  <PetWindow v-if="windowLabel === 'pet'" />
  <MainWindow v-else-if="startupComplete" :startup-message="startupMessage" />
  <main v-else class="startup-screen">正在启动 MoeMimi…</main>
</template>
