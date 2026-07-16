import { describe, expect, it, vi } from "vitest";
import { PresetDialogueEngine } from "./PresetDialogueEngine";

const script = {
  default: [{ text: "默认回复" }, { text: "另一个回复" }],
  triggers: { 你好: [{ text: "你好。" }] },
};

describe("PresetDialogueEngine", () => {
  it("matches normalized trigger text", async () => {
    const engine = new PresetDialogueEngine(script);
    await expect(engine.respond({ text: "你好！" })).resolves.toEqual({
      text: "你好。",
    });
  });

  it("falls back to the default list", async () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0);
    const engine = new PresetDialogueEngine(script);
    await expect(engine.respond({ text: "未匹配" })).resolves.toEqual({
      text: "默认回复",
    });
  });
});
