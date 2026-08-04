import { describe, expect, it } from "vitest";
import { buildLoginMethodsViewModel, DISABLED_LOGIN_METHOD_CAPABILITIES } from "./script";
import type { LoginMethodCapabilities, LoginMethodsUserSnapshot } from "./types";

const ENABLED_CAPABILITIES: LoginMethodCapabilities = {
  connectGoogle: true,
  reconnectGoogle: true,
  disconnectGoogle: true,
  setPassword: true,
  changePassword: true,
  removePassword: true,
  removeEmailAddress: true,
};

describe("ログイン方法の表示状態", () => {
  it("Googleだけの場合は最後のGoogleを解除できず、パスワード設定を案内する", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        emailAddresses: [email("email-google", "google@example.com", "verified", ["oauth_google"])],
        externalAccounts: [google("google-1", "google@example.com", "verified")],
      }),
      ENABLED_CAPABILITIES,
    );

    expect(result).toEqual({
      status: "ready",
      google: {
        accounts: [
          {
            id: "google-1",
            maskedEmail: "go***@example.com",
            status: "connected",
            canDisconnect: false,
            disconnectUnavailableReason: "ほかのログイン方法を設定してから操作してください。",
          },
        ],
        canConnect: false,
        connectUnavailableReason: "Googleはすでに登録されています。",
        canReconnect: false,
      },
      emailPassword: {
        passwordEnabled: false,
        verifiedEmails: [
          {
            id: "email-google",
            maskedEmail: "go***@example.com",
            verificationStatus: "verified",
            isPrimary: true,
            isLinked: true,
            canRemove: false,
            removeUnavailableReason: "Googleと接続中のため、メールアドレスだけを削除できません。",
          },
        ],
        unverifiedEmails: [],
        canSetPassword: true,
        canChangePassword: false,
        canRemovePassword: false,
        passwordRemovalUnavailableReason: null,
      },
    });
  });

  it("パスワードだけの場合はGoogleを連携できるが、最後のパスワードを削除できない", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("email-yahoo", "notify@yahoo.co.jp", "verified")],
      }),
      ENABLED_CAPABILITIES,
    );

    expect(result.google.canConnect).toBe(true);
    expect(result.emailPassword.canChangePassword).toBe(true);
    expect(result.emailPassword.canRemovePassword).toBe(false);
    expect(result.emailPassword.passwordRemovalUnavailableReason).toBe(
      "ほかのログイン方法を設定してから操作してください。",
    );
  });

  it("Googleとパスワードが別メールでも2つの方法として扱い、代替手段がある解除だけ許可する", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [
          email("email-google", "google@gmail.com", "verified", ["oauth_google"]),
          email("email-yahoo", "login@yahoo.co.jp", "verified"),
        ],
        externalAccounts: [google("google-1", "google@gmail.com", "verified")],
      }),
      ENABLED_CAPABILITIES,
    );

    expect(result.status).toBe("ready");
    expect(result.google.accounts[0]?.canDisconnect).toBe(true);
    expect(result.emailPassword.canRemovePassword).toBe(true);
    expect(result.emailPassword.verifiedEmails.map((item) => item.maskedEmail)).toEqual([
      "go***@gmail.com",
      "lo***@yahoo.co.jp",
    ]);
  });

  it("Googleの再確認と未確認メールを利用可能な方法に数えない", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        emailAddresses: [email("email-pending", "pending@example.com", "unverified")],
        externalAccounts: [google("google-pending", "pending@example.com", "unverified")],
      }),
      ENABLED_CAPABILITIES,
    );

    expect(result.google.accounts[0]).toMatchObject({ status: "needsReconnection", canDisconnect: false });
    expect(result.google.canReconnect).toBe(true);
    expect(result.emailPassword.unverifiedEmails).toHaveLength(1);
    expect(result.emailPassword.canRemovePassword).toBe(false);
  });

  it("パスワードありなのに検証済みメールがなければ状態不明として削除をすべて閉じる", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("email-pending", "pending@example.com", "unverified")],
        externalAccounts: [google("google-1", "google@example.com", "verified")],
      }),
      ENABLED_CAPABILITIES,
    );

    expect(result.status).toBe("unavailable");
    expect(result.google.accounts[0]?.canDisconnect).toBe(false);
    expect(result.emailPassword.canChangePassword).toBe(false);
    expect(result.emailPassword.canRemovePassword).toBe(false);
  });

  it("実環境で成立性未確認の操作能力は個別にfail-closedとなる", () => {
    const result = buildLoginMethodsViewModel(
      snapshot({
        passwordEnabled: true,
        emailAddresses: [email("email-yahoo", "login@yahoo.co.jp", "verified")],
        externalAccounts: [google("google-1", "google@gmail.com", "verified")],
      }),
      DISABLED_LOGIN_METHOD_CAPABILITIES,
    );

    expect(result.google.canConnect).toBe(false);
    expect(result.google.canReconnect).toBe(false);
    expect(result.google.accounts[0]?.canDisconnect).toBe(false);
    expect(result.emailPassword.canSetPassword).toBe(false);
    expect(result.emailPassword.canChangePassword).toBe(false);
    expect(result.emailPassword.canRemovePassword).toBe(false);
    expect(result.emailPassword.verifiedEmails[0]?.canRemove).toBe(false);
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

function email(id: string, emailAddress: string, verificationStatus: string, linkedTypes: string[] = []) {
  return {
    id,
    emailAddress,
    verificationStatus,
    linkedTo: linkedTypes.map((type, index) => ({ id: `link-${index}`, type })),
  };
}

function google(id: string, emailAddress: string, verificationStatus: string) {
  return { id, provider: "google", emailAddress, verificationStatus };
}
