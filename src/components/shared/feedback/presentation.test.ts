import { describe, expect, it } from "vitest";
import { getUserFacingErrorMessage } from "./presentation";

describe("getUserFacingErrorMessage", () => {
  it.each([
    ["Not found", "対象のデータが見つかりません。画面を再読み込みしてください。"],
    ["Unauthenticated", "ログインの有効期限が切れました。もう一度ログインしてください。"],
    ["Session expired", "操作の有効期限が切れました。画面を再読み込みしてください。"],
  ])("既知の内部エラー %s を次の行動が分かる文言へ変換する", (message, expected) => {
    expect(getUserFacingErrorMessage(message)).toBe(expected);
  });

  it("日本語の業務エラーは保持する", () => {
    expect(getUserFacingErrorMessage("この募集は締め切られました")).toBe("この募集は締め切られました");
  });

  it.each(["internal stack trace", "管理者所属を一意に確認できません", "Clerkとの同期中に内部エラーが発生しました"])(
    "未知または内部向けのエラー %s は画面へ露出しない",
    (message) => {
      expect(getUserFacingErrorMessage(message)).toBe(
        "操作を完了できませんでした。少し時間をおいて、もう一度お試しください。",
      );
    },
  );

  it("エラー内容が空でも次の行動を案内する", () => {
    expect(getUserFacingErrorMessage(undefined)).toBe(
      "操作を完了できませんでした。少し時間をおいて、もう一度お試しください。",
    );
  });
});
