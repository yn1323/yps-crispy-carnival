import { describe, expect, it } from "vitest";
import { getUserFacingErrorMessage } from "./errors";

describe("getUserFacingErrorMessage", () => {
  it.each([
    ["Not found", "対象のデータが見つかりません。画面を再読み込みしてください。"],
    ["Unauthenticated", "ログインの有効期限が切れました。もう一度ログインしてください。"],
    ["Session expired", "操作の有効期限が切れました。画面を再読み込みしてください。"],
  ])("内部エラー %s を利用者向けの案内に置き換える", (message, expected) => {
    expect(getUserFacingErrorMessage(message)).toBe(expected);
  });

  it("日本語の業務エラーはそのまま表示する", () => {
    expect(getUserFacingErrorMessage("この募集はすでに削除されています")).toBe("この募集はすでに削除されています");
  });

  it("未知の英語エラーは画面に露出させない", () => {
    expect(getUserFacingErrorMessage("Internal server error: database unavailable")).toBe("うまく処理できませんでした");
  });
});
