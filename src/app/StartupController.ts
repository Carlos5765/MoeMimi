import type { AppConfigRepository } from "../config/AppConfigRepository";
import { appConfigRepository } from "../config/AppConfigRepository";
import { resolveLaunchTarget } from "../config/resolve-launch-target";
import { toUserMessage } from "../core/errors";
import { petLoader, type PetLoader } from "../modules/pet/PetLoader";
import { petRepository, type PetRepository } from "../modules/pet/PetRepository";
import { windowService, type WindowService } from "./WindowService";

export class StartupController {
  constructor(
    private readonly configRepository: AppConfigRepository = appConfigRepository,
    private readonly pets: PetRepository = petRepository,
    private readonly loader: PetLoader = petLoader,
    private readonly windows: WindowService = windowService,
  ) {}

  async start(): Promise<string | undefined> {
    try {
      await this.pets.ensurePetStorage();
      const [config, reason] = await Promise.all([
        this.configRepository.load(),
        this.windows.startReason(),
      ]);
      const defaultPetExists = config.defaultPet
        ? await this.pets.hasPet(config.defaultPet)
        : false;
      const target = resolveLaunchTarget(config, reason, defaultPetExists);

      if (target === "main") {
        await this.windows.showMain();
        return config.defaultPet && !defaultPetExists
          ? `默认桌宠“${config.defaultPet}”不存在，已回到主界面。`
          : undefined;
      }

      try {
        const pet = await this.loader.load(config.defaultPet!);
        pet.renderer.destroy();
        await this.windows.showPet(config.defaultPet!);
      } catch (error) {
        console.error("Failed to launch default pet", error);
        await this.windows.showMain();
        return `默认桌宠加载失败，已回到主界面：${toUserMessage(error)}`;
      }
    } catch (error) {
      console.error("Startup failed", error);
      await this.windows.showMain();
      return `启动配置加载失败：${toUserMessage(error)}`;
    }
  }
}

export const startupController = new StartupController();
