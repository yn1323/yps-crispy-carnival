import { describe, expect, it } from "vitest";
import { assertVrtArtifactContract, forbiddenVrtArtifactNames, requiredVrtArtifactNames } from "./assertVrtArtifacts";

describe("assertVrtArtifactContract", () => {
  it("必須StoryのVRTがすべてあれば成功する", () => {
    expect(() => assertVrtArtifactContract(requiredVrtArtifactNames)).not.toThrow();
  });

  it("PNGが1件もなければ失敗する", () => {
    expect(() => assertVrtArtifactContract(["report.json"])).toThrowError("VRT capture produced no PNG artifacts.");
  });

  it("必須Storyが欠けていればStory IDを示して失敗する", () => {
    const [missing, ...remaining] = requiredVrtArtifactNames;

    expect(() => assertVrtArtifactContract(remaining)).toThrowError(
      `VRT capture is missing required stories:\n${missing}`,
    );
  });

  it("Behavior専用Storyが画像化されていれば失敗する", () => {
    const [unexpected] = forbiddenVrtArtifactNames;

    expect(() => assertVrtArtifactContract([...requiredVrtArtifactNames, unexpected])).toThrowError(
      `VRT capture includes behavior-only stories:\n${unexpected}`,
    );
  });
});
