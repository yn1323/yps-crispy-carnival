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

  it("未知の内部エラーは画面へ露出しない", () => {
    expect(getUserFacingErrorMessage("internal stack trace")).toBe("うまく処理できませんでした");
  });
});
