import { describe, expect, it } from "vitest";
import {
  buildCanonicalAccountSecuritySearchString,
  clearAccountSecurityFlowSearch,
  clearAccountSecurityOAuthSearch,
  needsAccountSecuritySearchCanonicalization,
  validateAccountSecuritySearch,
} from "./account.security";

describe("ログイン設定URL", () => {
  it("許可flowとGoogle系flowに結び付いたOAuth帰還だけを受け付ける", () => {
    expect(validateAccountSecuritySearch({ flow: "add-email-password" })).toEqual({ flow: "add-email-password" });
    expect(validateAccountSecuritySearch({ flow: "connect-google", oauth: "google" })).toEqual({
      flow: "connect-google",
      oauth: "google",
    });
    expect(validateAccountSecuritySearch({ flow: "replace-google", oauth: "google" })).toEqual({});
    expect(validateAccountSecuritySearch({ oauth: "google" })).toEqual({});
    expect(validateAccountSecuritySearch({ flow: "add-email-password", oauth: "google" })).toEqual({
      flow: "add-email-password",
    });
    expect(validateAccountSecuritySearch({ flow: "unknown", oauth: "github" })).toEqual({});
  });

  it("OAuth markerの除去ではflowだけを維持し、店舗・未知値・PII候補を破棄する", () => {
    expect(
      clearAccountSecurityOAuthSearch({
        flow: "connect-google",
        oauth: "google",
        shop: "invalid-shop",
        email: "do-not-keep@example.com",
        providerStatus: "cancelled",
      }),
    ).toEqual({
      flow: "connect-google",
      oauth: undefined,
      shop: undefined,
    });
  });

  it("overviewへ戻るときはflow、marker、店舗searchをすべて除去する", () => {
    expect(clearAccountSecurityFlowSearch()).toEqual({ flow: undefined, oauth: undefined, shop: undefined });
  });

  it("正当なflowとOAuth markerだけを一度ずつ持つcanonical URLへ収束する", () => {
    const valid = { flow: "connect-google" as const, oauth: "google" as const };
    expect(buildCanonicalAccountSecuritySearchString(valid)).toBe("?flow=connect-google&oauth=google");
    expect(needsAccountSecuritySearchCanonicalization("?flow=connect-google&oauth=google", valid)).toBe(false);
    expect(
      needsAccountSecuritySearchCanonicalization("?flow=connect-google&flow=unknown&oauth=google&oauth=google", valid),
    ).toBe(true);
  });

  it("単独marker、不正flow、未知query、PII候補を空のcanonical URLへ除去する", () => {
    expect(buildCanonicalAccountSecuritySearchString({ oauth: "google" })).toBe("");
    expect(buildCanonicalAccountSecuritySearchString({ flow: "invalid", email: "secret@example.com" })).toBe("");
    expect(needsAccountSecuritySearchCanonicalization("?oauth=google", {})).toBe(true);
    expect(needsAccountSecuritySearchCanonicalization("?email=secret%40example.com&shop=shop-1", {})).toBe(true);
  });
});
