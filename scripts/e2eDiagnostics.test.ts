import { describe, expect, it, vi } from "vitest";
import {
  classifyE2EFailure,
  getSafePathname,
  installSafeClerkTestingConsole,
  sanitizeDiagnosticMessage,
} from "../e2e/helpers/diagnostics";

describe("E2E safe diagnostics", () => {
  it("URL query、email、JWT、authorization、token値を出力しない", () => {
    const rawEmail = "person@gmail.com";
    const rawToken = "raw-capability-value";
    const rawJwt = "eyJabcdefghijk.abcdefghijklmnop.qrstuvwxyz12345";
    const sanitized = sanitizeDiagnosticMessage(
      `failed https://example.test/shifts/submit?token=${rawToken} ${rawEmail} authorization:BearerValue session=${rawJwt}`,
    );

    expect(sanitized).toContain("/shifts/submit?[redacted]");
    expect(sanitized).not.toContain(rawEmail);
    expect(sanitized).not.toContain(rawToken);
    expect(sanitized).not.toContain(rawJwt);
    expect(sanitized).not.toContain("BearerValue");
  });

  it("response URLからqueryを除いたpathnameだけを返す", () => {
    expect(getSafePathname("https://example.test/api/value?token=secret")).toBe("/api/value");
    expect(getSafePathname("not a url")).toBe("invalid-url");
  });

  it("JSON形式のtokenとauthorizationを出力しない", () => {
    const rawToken = "123e4567-e89b-12d3-a456-426614174000";
    const rawAuthorization = "Bearer private-value";
    const sanitized = sanitizeDiagnosticMessage(
      JSON.stringify({ token: rawToken, authorization: rawAuthorization, status: "failed" }),
    );

    expect(sanitized).toContain('"token":"[redacted]"');
    expect(sanitized).not.toContain(rawToken);
    expect(sanitized).not.toContain(rawAuthorization);
  });

  it("診断メッセージからsecret環境変数名を出力しない", () => {
    const sanitized = sanitizeDiagnosticMessage(
      "configuration warning: CLERK_SECRET_KEY and CONVEX_DEPLOY_KEY are present",
    );

    expect(sanitized).toContain("[secret-env-redacted]");
    expect(sanitized).not.toContain("CLERK_SECRET_KEY");
    expect(sanitized).not.toContain("CONVEX_DEPLOY_KEY");
  });

  it("Clerk FAPI URLのsession識別子とqueryを出力しない", () => {
    const sessionId = ["sess", "3HMzXdDIrBEahLYAhJlnHtXsPPj"].join("_");
    const databaseJwt = ["dvb", "3HMzXevYlhQxPkZGU9dzLpLXgIu"].join("_");
    const sanitized = sanitizeDiagnosticMessage(
      `[Clerk Testing] failed https://example.test/v1/client/sessions/${sessionId}/tokens/convex?db=${databaseJwt}`,
    );

    expect(sanitized).toContain("/sessions/[clerk-id-redacted]/tokens/convex?[redacted]");
    expect(sanitized).not.toContain(sessionId);
    expect(sanitized).not.toContain(databaseJwt);
  });

  it("Clerk Testingのconsole warningを出力前にsanitizationする", () => {
    const sessionId = ["sess", "3HMzXdDIrBEahLYAhJlnHtXsPPj"].join("_");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const restore = installSafeClerkTestingConsole();
    let logged = "";
    try {
      console.warn(`[Clerk Testing] failed https://example.test/v1/client/sessions/${sessionId}?token=private`);
      logged = String(warn.mock.calls[0]?.[0]);
    } finally {
      restore();
      warn.mockRestore();
    }

    expect(logged).toContain("[Clerk Testing]");
    expect(logged).toContain("?[redacted]");
    expect(logged).not.toContain(sessionId);
    expect(logged).not.toContain("private");
  });

  it.each([
    ["E2E poll deadline exceeded: token", "capability-deadline"],
    ["E2E Convex command failed: testing:getLatestMagicLinkToken (invalid-json, abc)", "capability-deadline"],
    ["locator expected to be visible", "selector-state"],
    ["OptimisticConcurrencyControlFailure", "occ"],
    ["E2E browser runtime signals detected (console-error=1)", "browser-runtime"],
    ["E2E browser runtime signals detected (same-origin-5xx=1)", "browser-runtime"],
    ["unclassified failure", "unknown"],
  ] as const)("失敗を安全な分類へ寄せる: %s", (message, expected) => {
    expect(classifyE2EFailure(message)).toBe(expected);
  });
});
