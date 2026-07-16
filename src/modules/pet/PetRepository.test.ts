import { describe, expect, it } from "vitest";
import { validatePetId } from "./PetRepository";

describe("validatePetId", () => {
  it("accepts Chinese and common safe identifiers", () => {
    expect(() => validatePetId("若叶睦")).not.toThrow();
    expect(() => validatePetId("simple-mimi_01")).not.toThrow();
  });

  it("rejects path traversal and Windows-invalid names", () => {
    for (const value of ["", ".", "..", "../pet", "pet/name", "pet?name", "CON"]) {
      expect(() => validatePetId(value)).toThrow();
    }
  });
});
