import { describe, expect, it } from "vitest";
import { buildLoginMethodsViewModel } from "./script";
import type { LoginMethodsUserSnapshot } from "./types";

describe("ログイン方法の表示状態", () => {
  it("GoogleのみではPrimary変更とパスワード追加を許可し、Google解除を許可しない", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        emailAddresses: [email("email-google", "google@example.com", "verified")],
        externalAccounts: [google("google-1", "google@example.com", "verified")],
      }),
    );

    expect(result).toEqual({
      status: "ready",
      methodState: "googleOnly",
      google: {
        accounts: [
          {
            id: "google-1",
            emailAddress: "google@example.com",
            status: "connected",
            canDisconnect: false,
            disconnectUnavailableReason: "確認済みメールアドレスとパスワードを設定してから操作してください。",
          },
        ],
        canConnect: false,
        canReconnect: false,
      },
      emailPassword: {
        primaryEmail: {
          id: "email-google",
          emailAddress: "google@example.com",
          verificationStatus: "verified",
        },
        canChangeLoginEmail: true,
        canChangePassword: false,
        canSetPassword: true,
      },
    });
  });

  it.each(["login@gmail.com", "notify@yahoo.co.jp"])(
    "メールドメインが%sでもメール・パスのみの操作可否を同じように導出する",
    (emailAddress) => {
      const result = buildLoginMethodsViewModel(
        snapshot({
          passwordEnabled: true,
          emailAddresses: [email("email-password", emailAddress, "verified")],
        }),
      );

      expect(result.methodState).toBe("passwordOnly");
      expect(result.google.canConnect).toBe(true);
      expect(result.emailPassword.canChangeLoginEmail).toBe(true);
      expect(result.emailPassword.canChangePassword).toBe(true);
      expect(result.emailPassword.canSetPassword).toBe(false);
    },
  );

  it("Googleと同じメールのパスワードがあればGoogle＋メール・パスとして解除を許可する", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("email-google", "google@gmail.com", "verified")],
        externalAccounts: [google("google-1", "google@gmail.com", "verified")],
      }),
    );

    expect(result.methodState).toBe("googleAndPassword");
    expect(result.google.accounts).toEqual([
      {
        id: "google-1",
        emailAddress: "google@gmail.com",
        status: "connected",
        canDisconnect: true,
        disconnectUnavailableReason: null,
      },
    ]);
    expect(result.google.canConnect).toBe(false);
    expect(result.emailPassword.canChangeLoginEmail).toBe(true);
    expect(result.emailPassword.canChangePassword).toBe(true);
  });

  it("確認済みPrimaryがあれば3状態すべてで同じPrimary変更操作を許可する", () => {
    const snapshots: LoginMethodsUserSnapshot[] = [
      snapshot({
        emailAddresses: [email("primary-google", "google@example.com", "verified")],
        externalAccounts: [google("google-1", "google@example.com", "verified")],
      }),
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("primary-password", "password@example.com", "verified")],
      }),
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("primary-both", "both@example.com", "verified")],
        externalAccounts: [google("google-2", "both@example.com", "verified")],
      }),
    ];

    expect(
      snapshots.map((item) => {
        const viewModel = buildLoginMethodsViewModel(item);
        return [viewModel.methodState, viewModel.emailPassword.canChangeLoginEmail];
      }),
    ).toEqual([
      ["googleOnly", true],
      ["passwordOnly", true],
      ["googleAndPassword", true],
    ]);
  });

  it("Primaryが未確認でも表示対象はその1件だけにし、変更を許可しない", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        primaryEmailAddressId: "email-pending",
        emailAddresses: [
          email("email-verified", "verified@example.com", "verified"),
          email("email-pending", "pending@example.com", "unverified"),
        ],
        externalAccounts: [google("google-1", "verified@example.com", "verified")],
      }),
    );

    expect(result.methodState).toBe("googleOnly");
    expect(result.emailPassword.primaryEmail).toEqual({
      id: "email-pending",
      emailAddress: "pending@example.com",
      verificationStatus: "unverified",
    });
    expect(result.emailPassword.canChangeLoginEmail).toBe(false);
    expect(result.emailPassword.canChangePassword).toBe(false);
  });

  it("Clerkに複数のEmailAddressが残っていてもメールログイン対象はPrimaryの1件だけにする", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [
          email("email-primary", "login@example.com", "verified"),
          email("email-verified", "verified@example.com", "verified"),
          email("email-pending", "pending@example.com", "unverified"),
        ],
      }),
    );

    expect(result.emailPassword.primaryEmail).toEqual({
      id: "email-primary",
      emailAddress: "login@example.com",
      verificationStatus: "verified",
    });
    expect("verifiedEmails" in result.emailPassword).toBe(false);
    expect("unverifiedEmails" in result.emailPassword).toBe(false);
  });

  it("パスワード追加は確認済みメールがありpasswordEnabledがfalseの場合だけ許可する", () => {
    const verifiedWithoutPassword = buildLoginMethodsViewModel(
      snapshot({ emailAddresses: [email("verified", "verified@example.com", "verified")] }),
    );
    const unverifiedWithoutPassword = buildLoginMethodsViewModel(
      snapshot({ emailAddresses: [email("pending", "pending@example.com", "unverified")] }),
    );
    const verifiedWithPassword = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("verified", "verified@example.com", "verified")],
      }),
    );

    expect(verifiedWithoutPassword.emailPassword.canSetPassword).toBe(true);
    expect(unverifiedWithoutPassword.emailPassword.canSetPassword).toBe(false);
    expect(verifiedWithPassword.emailPassword.canSetPassword).toBe(false);
  });

  it("パスワード変更は確認済みPrimaryと既存パスワードがそろう場合だけ許可する", () => {
    const googleOnly = buildLoginMethodsViewModel(
      snapshot({
        emailAddresses: [email("google-email", "google@example.com", "verified")],
        externalAccounts: [google("google-1", "google@example.com", "verified")],
      }),
    );
    const passwordOnly = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("password-email", "login@example.com", "verified")],
      }),
    );
    const both = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("both-email", "login@example.com", "verified")],
        externalAccounts: [google("google-2", "google@example.com", "verified")],
      }),
    );
    const unverifiedPrimary = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("pending-email", "pending@example.com", "unverified")],
        externalAccounts: [google("google-3", "google@example.com", "verified")],
      }),
    );

    expect([
      googleOnly.emailPassword.canChangePassword,
      passwordOnly.emailPassword.canChangePassword,
      both.emailPassword.canChangePassword,
      unverifiedPrimary.emailPassword.canChangePassword,
    ]).toEqual([false, true, true, false]);
  });

  it("Google追加はメール・パスがありGoogle ExternalAccountがない場合だけ許可する", () => {
    const passwordOnly = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
      }),
    );
    const withVerifiedGoogle = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-verified", "google@example.com", "verified")],
      }),
    );
    const withPendingGoogle = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-pending", "google@example.com", "unverified")],
      }),
    );

    expect(passwordOnly.google.canConnect).toBe(true);
    expect(withVerifiedGoogle.google.canConnect).toBe(false);
    expect(withPendingGoogle.google.canConnect).toBe(false);
    expect(withPendingGoogle.google.canReconnect).toBe(true);
  });

  it("Google再接続はメール・パスと一件だけのfailed、unverified、expired resourceがある場合に限る", () => {
    const pendingWithoutFallback = buildLoginMethodsViewModel(
      snapshot({
        externalAccounts: [google("google-pending", "google@example.com", "unverified")],
      }),
    );
    const multiplePending = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [
          google("google-a", "google-a@example.com", "unverified"),
          google("google-b", "google-b@example.com", "failed"),
        ],
      }),
    );
    const unknownStatus = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-unknown", "google@example.com", "unknown")],
      }),
    );
    const failed = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-failed", "google@example.com", "failed")],
      }),
    );
    const expired = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-expired", "google@example.com", "expired")],
      }),
    );

    expect(pendingWithoutFallback.google.canReconnect).toBe(false);
    expect(multiplePending.google.canReconnect).toBe(false);
    expect(unknownStatus.google.canReconnect).toBe(false);
    expect(failed.google.canReconnect).toBe(true);
    expect(expired.google.canReconnect).toBe(true);
  });

  it("Google解除は確認済みGoogleとメール・パスがそろう場合だけ許可する", () => {
    const withoutPassword = buildLoginMethodsViewModel(
      snapshot({
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-1", "google@example.com", "verified")],
      }),
    );
    const withoutVerifiedEmail = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("pending", "pending@example.com", "unverified")],
        externalAccounts: [google("google-2", "google@example.com", "verified")],
      }),
    );
    const pendingGoogle = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-3", "google@example.com", "unverified")],
      }),
    );

    expect(withoutPassword.google.accounts[0]?.canDisconnect).toBe(false);
    expect(withoutVerifiedEmail.google.accounts[0]?.canDisconnect).toBe(false);
    expect(pendingGoogle.google.accounts[0]?.canDisconnect).toBe(false);
  });

  it("利用できるGoogleもメール・パスもなければ状態をunavailableにする", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({ emailAddresses: [email("pending", "pending@example.com", "unverified")] }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.methodState).toBeNull();
    expect(result.google.canConnect).toBe(false);
    expect(result.emailPassword.canChangeLoginEmail).toBe(false);
    expect(result.emailPassword.canChangePassword).toBe(false);
    expect(result.emailPassword.canSetPassword).toBe(false);
  });

  it("パスワード削除とGoogle置換のcapabilityを公開しない", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("login", "login@example.com", "verified")],
        externalAccounts: [google("google-1", "google@example.com", "verified")],
      }),
    );

    expect("canRemovePassword" in result.emailPassword).toBe(false);
    expect(result.emailPassword.canChangePassword).toBe(true);
    expect("canReplace" in result.google).toBe(false);
  });
});

function snapshot(overrides: Partial<LoginMethodsUserSnapshot> = {}): LoginMethodsUserSnapshot {
  return {
    primaryEmailAddressId: overrides.emailAddresses?.[0]?.id ?? null,
    passwordEnabled: false,
    emailAddresses: [],
    externalAccounts: [],
    ...overrides,
  };
}

function email(id: string, emailAddress: string, verificationStatus: string) {
  return { id, emailAddress, verificationStatus };
}

function google(id: string, emailAddress: string, verificationStatus: string) {
  return { id, provider: "google", emailAddress, verificationStatus };
}
