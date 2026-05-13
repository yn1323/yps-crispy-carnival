import { describe, expect, it } from "vitest";
import { suggestEmailTypoFix } from "./emailTypo";

describe("suggestEmailTypoFix", () => {
  it("よくあるメールドメインのtypoを提案する", () => {
    expect(suggestEmailTypoFix("hanako@gmai.com")).toBe("hanako@gmail.com");
    expect(suggestEmailTypoFix("TARO@GMAIL.CON")).toBe("taro@gmail.com");
  });

  it("候補がないメールアドレスではnullを返す", () => {
    expect(suggestEmailTypoFix("hanako@example.com")).toBeNull();
    expect(suggestEmailTypoFix("not-email")).toBeNull();
  });
});
