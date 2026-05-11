import { describe, expect, it } from "vitest";
import { normalizeAuthRedirect } from "./redirect";

describe("normalizeAuthRedirect", () => {
  it("内部パスを維持する", () => {
    expect(normalizeAuthRedirect("/dashboard?tab=staff#list")).toBe("/dashboard?tab=staff#list");
  });

  it("外部URLや不正な値はdashboardへ戻す", () => {
    expect(normalizeAuthRedirect("https://example.com/dashboard")).toBe("/dashboard");
    expect(normalizeAuthRedirect("//example.com/dashboard")).toBe("/dashboard");
    expect(normalizeAuthRedirect(undefined)).toBe("/dashboard");
  });

  it("認証ページへのループはdashboardへ戻す", () => {
    expect(normalizeAuthRedirect("/login?redirect=/dashboard")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/signup")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/forgot-password")).toBe("/dashboard");
  });
});
