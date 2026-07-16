import { describe, expect, it } from "vitest";
import { fitWithin, resizeKeepingAspect } from "./pet-window-layout";

describe("pet window layout", () => {
  it("fits a large image without changing its aspect ratio", () => {
    expect(fitWithin({ width: 1200, height: 600 }, { width: 420, height: 500 })).toEqual({
      width: 420,
      height: 210,
    });
  });

  it("resizes from either pointer axis while preserving the aspect ratio", () => {
    expect(
      resizeKeepingAspect(
        { width: 400, height: 200 },
        100,
        10,
        { width: 900, height: 700 },
      ),
    ).toEqual({ width: 500, height: 250 });
    expect(
      resizeKeepingAspect(
        { width: 400, height: 200 },
        10,
        100,
        { width: 900, height: 700 },
      ),
    ).toEqual({ width: 600, height: 300 });
  });

  it("keeps the resized image inside minimum and screen bounds", () => {
    expect(
      resizeKeepingAspect(
        { width: 400, height: 200 },
        -1000,
        -1000,
        { width: 700, height: 300 },
      ),
    ).toEqual({ width: 192, height: 96 });
    expect(
      resizeKeepingAspect(
        { width: 400, height: 200 },
        1000,
        1000,
        { width: 700, height: 300 },
      ),
    ).toEqual({ width: 600, height: 300 });
  });
});
