import { describe, expect, it } from "vitest";
import { assertRegSuitBaseline, type RegSuitBaselineState } from "./prepareRegSuitBaseline";

const populatedBaseline: RegSuitBaselineState = {
  exists: true,
  imageCount: 2,
  isDirectory: true,
};

describe("RegSuit baseline gate", () => {
  it("画像を含む既存baselineを許可する", () => {
    expect(() => assertRegSuitBaseline(populatedBaseline, true)).not.toThrow();
  });

  it.each([
    ["欠落", { exists: false, imageCount: 0, isDirectory: false }, "was not found"],
    ["directory以外", { exists: true, imageCount: 0, isDirectory: false }, "is not a directory"],
    ["画像0件", { exists: true, imageCount: 0, isDirectory: true }, "contains no images"],
  ] as const)("Pull Requestでは%sを拒否する", (_label, state, expectedMessage) => {
    expect(() => assertRegSuitBaseline(state, true)).toThrow(expectedMessage);
  });

  it("base branchの明示bootstrapでは空baselineを許可する", () => {
    expect(() => assertRegSuitBaseline({ exists: false, imageCount: 0, isDirectory: false }, false)).not.toThrow();
  });
});
