import { describe, expect, it } from "vitest";
import { deriveEmailPasswordMigration } from "./migrationScript";
import type { LoginMethodsUserSnapshot } from "./types";

describe("メール・パスワード追加のphase導出", () => {
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

    expect(deriveEmailPasswordMigration(passwordReady)).toEqual({
      phase: "methodReady",
      targetEmailAddressId: null,
    });
  });

  it("確認済みメールとパスワードが揃わなければ選択状態を維持する", () => {
    expect(
      deriveEmailPasswordMigration(
        snapshot({
          passwordEnabled: true,
          emailAddresses: [email("pending", "unverified")],
        }),
      ),
    ).toEqual({
      phase: "choosingEmail",
      targetEmailAddressId: null,
    });

    expect(
      deriveEmailPasswordMigration(
        snapshot({
          emailAddresses: [email("verified", "verified")],
        }),
      ),
    ).toEqual({
      phase: "choosingEmail",
      targetEmailAddressId: null,
    });
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
