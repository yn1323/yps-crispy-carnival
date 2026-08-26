import { describe, expect, it } from "vitest";
import { PROMOTION_CODE_INVALID_ERROR_CODE } from "@/convex/setup/constants";
import { isPromotionCodeInvalidError } from "./script";

describe("初回登録エラーの分類", () => {
  it("structured codeが一致する場合だけプロモーションコード不一致として扱う", () => {
    expect(isPromotionCodeInvalidError({ data: { code: PROMOTION_CODE_INVALID_ERROR_CODE } })).toBe(true);
    expect(isPromotionCodeInvalidError({ data: { code: "OTHER_ERROR" } })).toBe(false);
    expect(isPromotionCodeInvalidError({ data: "プロモーションコードを確認してください。" })).toBe(false);
    expect(isPromotionCodeInvalidError(new Error("network error"))).toBe(false);
  });
});
