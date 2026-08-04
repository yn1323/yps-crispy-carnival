import { describe, expect, it } from "vitest";
import {
  acceptsGoogleOAuthMarker,
  buildGoogleOAuthReturnPath,
  canStartGoogleConnection,
  deriveEmailPasswordMigration,
  hasEmailPasswordMethod,
  hasVerifiedGoogle,
  isLoginMethodMigrationFlow,
} from "./migrationScript";
import type { LoginMethodsUserSnapshot } from "./types";

describe("ログイン方法追加の純粋判定", () => {
  it("メール・パス追加とGoogle追加だけをflowとして受理する", () => {
    expect(isLoginMethodMigrationFlow("add-email-password")).toBe(true);
    expect(isLoginMethodMigrationFlow("connect-google")).toBe(true);
    expect(isLoginMethodMigrationFlow("replace-google")).toBe(false);
    expect(isLoginMethodMigrationFlow("change-primary-email")).toBe(false);
    expect(isLoginMethodMigrationFlow({ flow: "connect-google" })).toBe(false);
  });

  it("Google OAuth markerはconnect-googleだけへ結び付ける", () => {
    expect(acceptsGoogleOAuthMarker("connect-google")).toBe(true);
    expect(acceptsGoogleOAuthMarker("add-email-password")).toBe(false);
    expect(acceptsGoogleOAuthMarker(undefined)).toBe(false);
    expect(buildGoogleOAuthReturnPath("connect-google")).toBe("/account/security?flow=connect-google&oauth=google");
  });

  it("EmailAddressの確認とパスワード設定を別phaseとして導出する", () => {
    const pending = snapshot({ emailAddresses: [email("pending", "unverified")] });
    expect(deriveEmailPasswordMigration(pending, "pending")).toEqual({
      phase: "verifyingEmail",
      targetEmailAddressId: "pending",
    });

    const verified = snapshot({ emailAddresses: [email("verified", "verified")] });
    expect(deriveEmailPasswordMigration(verified, "verified")).toEqual({
      phase: "settingPassword",
      targetEmailAddressId: "verified",
    });

    expect(
      deriveEmailPasswordMigration(
        snapshot({ passwordEnabled: true, emailAddresses: [email("verified", "verified")] }),
        "verified",
      ),
    ).toEqual({ phase: "methodReady", targetEmailAddressId: "verified" });
  });

  it("Googleに紐づく確認済みメールもパスワード追加対象として扱う", () => {
    const linkedEmail = snapshot({
      emailAddresses: [email("google-email", "verified")],
      externalAccounts: [google("google-old", "verified")],
    });

    expect(deriveEmailPasswordMigration(linkedEmail, "google-email")).toEqual({
      phase: "settingPassword",
      targetEmailAddressId: "google-email",
    });
  });

  it("現在Userに属さないEmailAddress IDは選択状態へ戻す", () => {
    const currentUser = snapshot({ emailAddresses: [email("current-email", "verified")] });

    expect(deriveEmailPasswordMigration(currentUser, "other-user-email")).toEqual({
      phase: "choosingEmail",
      targetEmailAddressId: null,
    });
  });

  it("既存のメール・パスがあれば追加済みとして判定する", () => {
    const passwordReady = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("login", "verified")],
    });

    expect(hasEmailPasswordMethod(passwordReady)).toBe(true);
    expect(deriveEmailPasswordMigration(passwordReady)).toEqual({
      phase: "methodReady",
      targetEmailAddressId: null,
    });
  });

  it("Google追加はメール・パスがありGoogle ExternalAccountがない場合だけ開始できる", () => {
    const passwordOnly = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("login", "verified")],
    });
    const withoutVerifiedEmail = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("pending", "unverified")],
    });
    const existingGoogle = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("login", "verified")],
      externalAccounts: [google("google-old", "verified")],
    });
    const pendingGoogle = snapshot({
      passwordEnabled: true,
      emailAddresses: [email("login", "verified")],
      externalAccounts: [google("google-pending", "unverified")],
    });

    expect(canStartGoogleConnection(passwordOnly)).toBe(true);
    expect(canStartGoogleConnection(withoutVerifiedEmail)).toBe(false);
    expect(canStartGoogleConnection(existingGoogle)).toBe(false);
    expect(canStartGoogleConnection(pendingGoogle)).toBe(false);
  });

  it("確認済みGoogleだけを利用可能なGoogle認証として数える", () => {
    expect(hasVerifiedGoogle(snapshot({ externalAccounts: [google("verified", "verified")] }))).toBe(true);
    expect(hasVerifiedGoogle(snapshot({ externalAccounts: [google("pending", "unverified")] }))).toBe(false);
    expect(
      hasVerifiedGoogle(
        snapshot({
          externalAccounts: [
            { id: "github", provider: "github", emailAddress: "github@example.com", verificationStatus: "verified" },
          ],
        }),
      ),
    ).toBe(false);
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

function email(id: string, verificationStatus: string) {
  return { id, emailAddress: `${id}@example.com`, verificationStatus };
}

function google(id: string, verificationStatus: string) {
  return { id, provider: "google", emailAddress: `${id}@gmail.com`, verificationStatus };
}
