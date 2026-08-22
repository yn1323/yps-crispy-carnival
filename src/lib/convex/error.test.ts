import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { getConvexErrorMessage } from "./error";

describe("getConvexErrorMessage", () => {
  it("structured ConvexErrorの利用者向けmessageを返す", () => {
    const error = new ConvexError({
      code: "USAGE_LIMIT_EXCEEDED",
      message: "現在のプラン上限を超えています。",
      plan: "free",
    });

    expect(getConvexErrorMessage(error)).toBe("現在のプラン上限を超えています。");
  });

  it("transport後のdata objectでもmessageを返す", () => {
    expect(
      getConvexErrorMessage({
        data: { code: "USAGE_LIMIT_EXCEEDED", message: "利用人数を減らしてください。" },
      }),
    ).toBe("利用人数を減らしてください。");
  });
});
