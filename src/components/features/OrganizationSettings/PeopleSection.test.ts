import { describe, expect, it } from "vitest";
import { formatPeopleUsage } from "./PeopleSection";

describe("ページの見出しの横に出す人数と上限", () => {
  it("人数と上限を「人数 / 上限」の形で出す", () => {
    expect(formatPeopleUsage({ current: 12, max: 50, pendingInvitations: 0 })).toBe("12 / 50人");
  });

  it("読み切れなかった人数は、数えた人数ちょうどと読めないよう「以上」と上限を分けて出す", () => {
    expect(formatPeopleUsage({ current: 200, max: 50, pendingInvitations: 0 }, true)).toBe("200人以上 / 上限50人");
  });

  it.each([0, -1])("上限のない組織（上限%i）では何も出さない", (max) => {
    expect(formatPeopleUsage({ current: 12, max, pendingInvitations: 0 })).toBeNull();
    expect(formatPeopleUsage({ current: 12, max, pendingInvitations: 0 }, true)).toBeNull();
  });
});
