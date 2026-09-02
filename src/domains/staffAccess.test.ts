import { describe, expect, it } from "vitest";
import { parseRecruitmentSearchId } from "./staffAccess";

describe("parseRecruitmentSearchId", () => {
  it.each([undefined, null, 123, {}, [], "", "   "])("募集IDとして扱えない値 %j は欠落へ正規化する", (value) => {
    expect(parseRecruitmentSearchId(value)).toBeUndefined();
  });

  it("前後の空白を除いて募集IDを返す", () => {
    expect(parseRecruitmentSearchId("  recruitment-id  ")).toBe("recruitment-id");
  });

  it("128文字は受け付け、129文字は欠落へ正規化する", () => {
    expect(parseRecruitmentSearchId("a".repeat(128))).toBe("a".repeat(128));
    expect(parseRecruitmentSearchId("a".repeat(129))).toBeUndefined();
  });
});
