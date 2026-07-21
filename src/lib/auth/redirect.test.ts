import { describe, expect, it } from "vitest";
import { buildSsoCallbackUrl, normalizeAuthRedirect } from "./redirect";

describe("normalizeAuthRedirect", () => {
  it("内部パスを維持する", () => {
    expect(normalizeAuthRedirect("/dashboard?tab=staff#list")).toBe("/dashboard?tab=staff#list");
  });

  it("外部URLや不正な値はdashboardへ戻す", () => {
    expect(normalizeAuthRedirect("https://example.com/dashboard")).toBe("/dashboard");
    expect(normalizeAuthRedirect("//example.com/dashboard")).toBe("/dashboard");
    expect(normalizeAuthRedirect(undefined)).toBe("/dashboard");
  });

  it.each(["/safe/..//evil.example", "/safe/%2e%2e//evil.example", "/safe\\..\\\\evil.example"])(
    "URL正規化後に外部host形式になるpathを拒否する: %s",
    (redirect) => {
      expect(normalizeAuthRedirect(redirect)).toBe("/dashboard");
    },
  );

  it("認証ページへのループはdashboardへ戻す", () => {
    expect(normalizeAuthRedirect("/login?redirect=/dashboard")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/signup")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/forgot-password")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/sso-callback")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/safe/../login")).toBe("/dashboard");
  });
});

describe("buildSsoCallbackUrl", () => {
  it("正規化したredirectをcallback queryへ保持する", () => {
    expect(buildSsoCallbackUrl("/dashboard?tab=staff#list")).toBe(
      "/sso-callback?redirect=%2Fdashboard%3Ftab%3Dstaff%23list",
    );
  });

  it("外部URLはdashboardへ置き換えてcallback queryへ保持する", () => {
    expect(buildSsoCallbackUrl("https://example.com/dashboard")).toBe("/sso-callback?redirect=%2Fdashboard");
  });
});
