import { describe, expect, it } from "vitest";
import { clearAccountSecurityOAuthSearch, validateAccountSecuritySearch } from "./account.security";

describe("ログイン設定URL", () => {
  it("Google account linking専用のOAuth帰還だけを受け付ける", () => {
    expect(validateAccountSecuritySearch({ oauth: "google", shop: "invalid-shop", ignored: "value" })).toEqual({
      oauth: "google",
    });
    expect(validateAccountSecuritySearch({ oauth: "github" })).toEqual({});
  });

  it("OAuth帰還の収束後はmarkerと店舗searchを破棄し、ほかのqueryは維持する", () => {
    expect(
      clearAccountSecurityOAuthSearch({ oauth: "google", shop: "invalid-shop", providerStatus: "cancelled" }),
    ).toEqual({
      oauth: undefined,
      shop: undefined,
      providerStatus: "cancelled",
    });
  });
});
