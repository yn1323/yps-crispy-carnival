import { describe, expect, it } from "vitest";
import {
  isCanonicalBreakPosition,
  isCanonicalWorkPosition,
  isLegacyCompatibleBreakPosition,
  isLegacyCompatibleWorkPosition,
} from "./positions";

describe("休憩position判定", () => {
  it("保存契約ではcanonicalなIDだけを休憩として扱う", () => {
    expect(isCanonicalBreakPosition({ positionId: "break" })).toBe(true);
    expect(isCanonicalBreakPosition({ positionId: "legacy-break" })).toBe(false);
    expect(isCanonicalWorkPosition({ positionId: "break" })).toBe(false);
    expect(isCanonicalWorkPosition({ positionId: "legacy-break" })).toBe(true);
  });

  it("legacy表示ではIDまたは従来名が一致するsegmentを休憩として扱う", () => {
    expect(isLegacyCompatibleBreakPosition({ positionId: "break", positionName: "別名" })).toBe(true);
    expect(isLegacyCompatibleBreakPosition({ positionId: "legacy-break", positionName: "休憩" })).toBe(true);
    expect(isLegacyCompatibleBreakPosition({ positionId: "work", positionName: "ホール" })).toBe(false);
    expect(isLegacyCompatibleWorkPosition({ positionId: "legacy-break", positionName: "休憩" })).toBe(false);
    expect(isLegacyCompatibleWorkPosition({ positionId: "work", positionName: "ホール" })).toBe(true);
  });
});
