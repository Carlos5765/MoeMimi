import { describe, expect, it } from "vitest";
import { resolveLaunchTarget } from "./resolve-launch-target";

describe("resolveLaunchTarget", () => {
  it("opens main when no default pet is configured", () => {
    expect(resolveLaunchTarget({ launch: "pet" }, "manual", false)).toBe("main");
  });

  it("opens main when the configured pet does not exist", () => {
    expect(
      resolveLaunchTarget(
        { defaultPet: "missing", launch: "pet" },
        "manual",
        false,
      ),
    ).toBe("main");
  });

  it("uses the manual launch setting", () => {
    expect(
      resolveLaunchTarget(
        { defaultPet: "mimi", launch: "pet" },
        "manual",
        true,
      ),
    ).toBe("pet");
  });

  it("uses the separate autostart setting", () => {
    expect(
      resolveLaunchTarget(
        { defaultPet: "mimi", launch: "main", autostart: "pet" },
        "autostart",
        true,
      ),
    ).toBe("pet");
  });

  it("defaults both reasons to main", () => {
    expect(resolveLaunchTarget({ defaultPet: "mimi" }, "manual", true)).toBe(
      "main",
    );
    expect(
      resolveLaunchTarget({ defaultPet: "mimi" }, "autostart", true),
    ).toBe("main");
  });
});
