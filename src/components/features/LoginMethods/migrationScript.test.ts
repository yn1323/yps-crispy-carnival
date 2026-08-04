import { describe, expect, it } from "vitest";
import {
  acceptsGoogleOAuthMarker,
  buildGoogleOAuthReturnPath,
  canStartGoogleConnection,
  deriveEmailPasswordMigration,
  deriveGoogleReplacementPhase,
  hasEffectiveGoogleReplacementCapability,
  hasSafeEmailPasswordFallback,
  isLoginMethodMigrationFlow,
} from "./migrationScript";
import type { LoginMethodsUserSnapshot } from "./types";

describe("ログイン方法移行の純粋判定", () => {
  it("許可したflowだけを受理し、Google OAuth markerはGoogle系flowだけへ結び付ける", () => {
    expect(isLoginMethodMigrationFlow("add-email-password")).toBe(true);
    expect(isLoginMethodMigrationFlow("connect-google")).toBe(true);
    expect(isLoginMethodMigrationFlow("replace-google")).toBe(true);
    expect(isLoginMethodMigrationFlow("change-primary-email")).toBe(false);
    expect(isLoginMethodMigrationFlow({ flow: "connect-google" })).toBe(false);

    expect(acceptsGoogleOAuthMarker("connect-google")).toBe(true);
    expect(acceptsGoogleOAuthMarker("replace-google")).toBe(true);
    expect(acceptsGoogleOAuthMarker("add-email-password")).toBe(false);
    expect(acceptsGoogleOAuthMarker(undefined)).toBe(false);
    expect(buildGoogleOAuthReturnPath("connect-google")).toBe("/account/security?flow=connect-google&oauth=google");
  });

  it("EmailAddressの確認とパスワード設定を別phaseとして導出する", () => {
    const pending = snapshot({ emailAddresses: [email("pending", "unverified")] });
    expect(deriveEmailPasswordMigration(pending, "add-email-password", "pending")).toEqual({
      phase: "verifyingEmail",
      targetEmailAddressId: "pending",
    });

    const verified = snapshot({ emailAddresses: [email("verified", "verified")] });
    expect(deriveEmailPasswordMigration(verified, "add-email-password", "verified")).toEqual({
      phase: "settingPassword",
      targetEmailAddressId: "verified",
    });

    expect(
      deriveEmailPasswordMigration(
        snapshot({ passwordEnabled: true, emailAddresses: [email("verified", "verified")] }),
        "add-email-password",
        "verified",
      ),
    ).toEqual({ phase: "methodReady", targetEmailAddressId: "verified" });
  });

  it("Google linkedメールとパスワードだけの状態を安全な退避方法へ数えない", () => {
    const linkedOnly = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("google-email", "verified", true)],
      externalAccounts: [google("google-old", "verified")],
    });

    expect(hasSafeEmailPasswordFallback(linkedOnly)).toBe(false);
    expect(deriveEmailPasswordMigration(linkedOnly, "ensure-unlinked-fallback", "google-email")).toEqual({
      phase: "choosingEmail",
      targetEmailAddressId: null,
    });
  });

  it("Google接続は既存Googleを増やさず、置換時はunlinkedな退避方法も必須にする", () => {
    const passwordOnly = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("login", "verified")],
    });
    expect(canStartGoogleConnection(passwordOnly, "connect-google")).toBe(true);
    expect(canStartGoogleConnection(passwordOnly, "replace-google")).toBe(true);

    const existingGoogle = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("login", "verified")],
      externalAccounts: [google("google-old", "verified")],
    });
    expect(canStartGoogleConnection(existingGoogle, "connect-google")).toBe(false);

    const linkedFallback = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("google-email", "verified", true)],
    });
    expect(canStartGoogleConnection(linkedFallback, "replace-google")).toBe(false);
  });

  it("Google置換は複合capabilityと退避状態をfail-closedに評価する", () => {
    const allEnabled = {
      replaceGoogleAccount: true,
      setPassword: true,
      disconnectGoogle: true,
      connectGoogle: true,
    };
    expect(hasEffectiveGoogleReplacementCapability(allEnabled)).toBe(true);
    expect(hasEffectiveGoogleReplacementCapability({ ...allEnabled, disconnectGoogle: false })).toBe(false);

    const linkedOnly = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("google-email", "verified", true)],
      externalAccounts: [google("google-old", "verified")],
    });
    expect(deriveGoogleReplacementPhase(linkedOnly, allEnabled, "google-old")).toBe("ensuringFallback");

    const fallbackReady = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("fallback", "verified")],
      externalAccounts: [google("google-old", "verified")],
    });
    expect(deriveGoogleReplacementPhase(fallbackReady, allEnabled, "google-old")).toBe("fallbackReady");
    expect(deriveGoogleReplacementPhase(fallbackReady, allEnabled, null)).toBe("unavailable");

    const multipleGoogle = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("fallback", "verified")],
      externalAccounts: [google("google-old", "verified"), google("google-other", "verified")],
    });
    expect(deriveGoogleReplacementPhase(multipleGoogle, allEnabled, "google-old")).toBe("unavailable");

    const oldRemoved = snapshot({ passwordEnabled: true, emailAddresses: [email("fallback", "verified")] });
    expect(deriveGoogleReplacementPhase(oldRemoved, allEnabled, "google-old")).toBe("connectingNewGoogle");
    expect(deriveGoogleReplacementPhase(oldRemoved, allEnabled, null)).toBe("unavailable");

    const newConnected = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("fallback", "verified")],
      externalAccounts: [google("google-new", "verified")],
    });
    expect(deriveGoogleReplacementPhase(newConnected, allEnabled, "google-old")).toBe("newGoogleReady");
    expect(deriveGoogleReplacementPhase(newConnected, { ...allEnabled, connectGoogle: false }, "google-old")).toBe(
      "unavailable",
    );
  });
});

function snapshot(overrides: Partial<LoginMethodsUserSnapshot>): LoginMethodsUserSnapshot {
  return {
    primaryEmailAddressId: overrides.emailAddresses?.[0]?.id ?? null,
    passwordEnabled: false,
    emailAddresses: [],
    externalAccounts: [],
    ...overrides,
  };
}

function email(id: string, verificationStatus: string, linked = false) {
  return {
    id,
    emailAddress: `${id}@example.com`,
    verificationStatus,
    linkedTo: linked ? [{ id: `link-${id}`, type: "oauth_google" }] : [],
  };
}

function google(id: string, verificationStatus: string) {
  return { id, provider: "google", emailAddress: `${id}@gmail.com`, verificationStatus };
}
