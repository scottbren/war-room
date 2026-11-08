import { describe, expect, it } from "vitest";
import { isTypingTarget } from "../src/typing";

describe("isTypingTarget", () => {
  it("is true for text fields, so typing a question does not toggle floors, labels or the truth view", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(isTypingTarget({ tagName } as unknown as EventTarget)).toBe(true);
  });
  it("is false for the page, the canvas and anything else", () => {
    for (const tagName of ["BODY", "CANVAS", "DIV", "BUTTON"]) expect(isTypingTarget({ tagName } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});
