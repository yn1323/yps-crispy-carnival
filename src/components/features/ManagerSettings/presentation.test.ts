import { describe, expect, it } from "vitest";
import { getManagerInvitationExpiryLabel, getManagerInvitationStatusPresentation } from "./presentation";

describe("管理者招待の表示変換", () => {
  it.each([
    ["pending", { label: "招待中", colorPalette: "orange" }],
    ["sendFailed", { label: "送信エラー", colorPalette: "red" }],
    ["limitReached", { label: "上限到達（現在は連携できません）", colorPalette: "orange" }],
    ["conflict", { label: "競合", colorPalette: "orange" }],
  ] as const)("%sを対応するラベルと色へ変換する", (status, expected) => {
    expect(getManagerInvitationStatusPresentation(status)).toEqual(expected);
  });

  it.each([
    ["日付変更直前", Date.UTC(2026, 4, 9, 14, 59, 59, 999), "招待リンク期限：2026年5月9日 23:59"],
    ["日付変更時点", Date.UTC(2026, 4, 9, 15, 0), "招待リンク期限：2026年5月10日 00:00"],
  ] as const)("UTC上の%sをJSTの暦日と時刻で表示する", (_case, expiresAt, expected) => {
    expect(getManagerInvitationExpiryLabel(expiresAt)).toBe(expected);
  });
});
