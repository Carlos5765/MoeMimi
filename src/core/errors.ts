export class MoeMimiError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class AppConfigInvalidError extends MoeMimiError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "应用设置已损坏，请检查或重置配置。", options);
  }
}

export class PetManifestInvalidError extends MoeMimiError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "桌宠配置格式不正确。", options);
  }
}

export class PetNotFoundError extends MoeMimiError {
  constructor(petId: string) {
    super(`Pet not found: ${petId}`, `找不到桌宠“${petId}”。`);
  }
}

export class PetAssetNotFoundError extends MoeMimiError {
  constructor(petId: string, asset: string) {
    super(
      `Pet asset not found: pets/${petId}/${asset}`,
      `桌宠“${petId}”缺少资源文件：${asset}`,
    );
  }
}

export class UnsupportedSchemaVersionError extends MoeMimiError {
  constructor(kind: string, version: unknown) {
    super(
      `Unsupported ${kind} schema version: ${String(version)}`,
      `${kind} 配置版本不受支持，请升级或重新导入。`,
    );
  }
}

export class UnsupportedPetFeatureError extends MoeMimiError {
  constructor(feature: string) {
    super(
      `Unsupported pet feature: ${feature}`,
      `当前版本暂不支持桌宠功能：${feature}`,
    );
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof MoeMimiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "发生了未知错误，请查看控制台详情。";
}
