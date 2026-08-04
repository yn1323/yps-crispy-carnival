// @vitest-environment jsdom

import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reverificationOptions: [] as unknown[],
  isReverificationCancelledError: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useReverification: (
    operation: (...args: unknown[]) => Promise<unknown>,
    options: { onNeedsReverification?: unknown },
  ) => {
    mocks.reverificationOptions.push(options);
    return (...args: unknown[]) => operation(...args);
  },
}));

vi.mock("@clerk/react/errors", () => ({
  isReverificationCancelledError: mocks.isReverificationCancelledError,
}));

import type { LoginMethodOperationRunner } from "./migrationTypes";
import { useGoogleConnectionController } from "./useGoogleConnectionController";

const GENERIC_CONNECTION_FAILURE =
  "このGoogleアカウントを接続できませんでした。現在のログイン方法は変更されていません。別のGoogleアカウントを選ぶか、ログイン設定に戻ってください。";

beforeEach(() => {
  mocks.reverificationOptions.length = 0;
  mocks.isReverificationCancelledError.mockReset();
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("Google接続controller", () => {
  it("account-management OAuthをflow専用URLとアカウント選択指定で開始する", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const pendingGoogle = googleResource("google-new", "unverified", "https://accounts.example.test/authorize");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.createExternalAccount).mockImplementation(async () => {
      user.externalAccounts = [pendingGoogle];
      return pendingGoogle;
    });
    const onNeedsReverification = vi.fn();
    const runOperation = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const navigate = vi.fn();
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: false,
        onNeedsReverification,
        runOperation: runOperation as unknown as LoginMethodOperationRunner,
        navigateToExternalVerification: navigate,
      }),
    );

    await act(async () => result.current.start());

    expect(user.createExternalAccount).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl: "/account/security?flow=connect-google&oauth=google",
      oidcPrompt: "select_account",
    });
    expect(navigate).toHaveBeenCalledWith("https://accounts.example.test/authorize");
    expect(runOperation).toHaveBeenCalledOnce();
    expect(mocks.reverificationOptions.length).toBeGreaterThanOrEqual(1);
    expect(
      mocks.reverificationOptions.every(
        (options) => (options as { onNeedsReverification?: unknown }).onNeedsReverification === onNeedsReverification,
      ),
    ).toBe(true);
  });

  it("markerなしで既存verified Googleがある手入力flowはfail-closedにする", () => {
    const verifiedEmail = emailResource("email-login", false);
    const existingGoogle = googleResource("google-existing", "verified");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [existingGoogle],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: false,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    expect(result.current.state.phase).toBe("unavailable");
    expect(result.current.state.feedback.status).toBe("error");
    expect(result.current.state.feedback.message).not.toContain(existingGoogle.emailAddress);
    expect(user.reload).not.toHaveBeenCalled();
  });

  it("新しいmountのOAuth帰還でcurrent User配下のverified Googleだけを利用可能とする", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const connectedGoogle = googleResource("google-connected", "verified");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [connectedGoogle],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const onHandled = vi.fn();
    const runOperation = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: true,
        onOAuthReturnHandled: onHandled,
        onNeedsReverification: vi.fn(),
        runOperation: runOperation as unknown as LoginMethodOperationRunner,
      }),
    );

    expect(onHandled).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.state.phase).toBe("methodReady"));
    expect(result.current.state.googleAccountId).toBe(connectedGoogle.id);
    expect(result.current.state.feedback).toEqual({
      status: "success",
      message: "Googleログインを利用できる状態になりました。以前のログイン方法は削除していません。",
    });
    expect(user.reload).toHaveBeenCalledOnce();
  });

  it("同じmountへOAuth callback markerが再送されても一度だけclaimする", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const connectedGoogle = googleResource("google-connected", "verified");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [connectedGoogle],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const onHandled = vi.fn();
    const { result, rerender } = renderHook(
      ({ oauthReturn }: { oauthReturn: boolean }) =>
        useGoogleConnectionController({
          isLoaded: true,
          user,
          enabled: true,
          flow: "connect-google",
          oauthReturn,
          onOAuthReturnHandled: onHandled,
          onNeedsReverification: vi.fn(),
          runOperation: async (operation) => operation(),
        }),
      { initialProps: { oauthReturn: true } },
    );

    await waitFor(() => expect(result.current.state.phase).toBe("methodReady"));

    rerender({ oauthReturn: false });
    rerender({ oauthReturn: true });
    expect(onHandled).toHaveBeenCalledOnce();
    expect(user.reload).toHaveBeenCalledOnce();
  });

  it("URLへOAuth markerを直打ちしてもverified Googleがなければ成功扱いにしない", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const onHandled = vi.fn();
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: true,
        onOAuthReturnHandled: onHandled,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));
    expect(onHandled).toHaveBeenCalledOnce();
    expect(result.current.state.phase).toBe("unavailable");
    expect(result.current.state.feedback.message).toBe(GENERIC_CONNECTION_FAILURE);
    expect(user.createExternalAccount).not.toHaveBeenCalled();
  });

  it("OAuth帰還時のGoogleがprovider確認待ちなら利用可能にしない", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const pendingGoogle = googleResource("google-pending", "unverified");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [pendingGoogle],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: true,
        onOAuthReturnHandled: vi.fn(),
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));
    expect(result.current.state.phase).toBe("unavailable");
    expect(result.current.state.googleAccountId).toBeNull();
    expect(result.current.state.feedback.message).not.toContain(pendingGoogle.emailAddress);
  });

  it("本人再確認を取り消した時はGoogle接続を完了扱いにしない", async () => {
    const cancellation = new Error("cancelled");
    mocks.isReverificationCancelledError.mockImplementation((error) => error === cancellation);
    const verifiedEmail = emailResource("email-login", false);
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.createExternalAccount).mockRejectedValue(cancellation);
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: false,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    let operationResult: boolean | undefined;
    await act(async () => {
      operationResult = await result.current.start();
    });

    expect(operationResult).toBe(false);
    expect(result.current.state.phase).toBe("readyToConnect");
    expect(result.current.state.feedback).toEqual({ status: "idle", message: null });
  });

  it("provider errorはprovider responseを表示せず汎用エラーへ閉じる", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.createExternalAccount).mockRejectedValue(
      new Error("access_denied for private-google-account@gmail.com"),
    );
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: false,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.start());

    expect(result.current.state.phase).toBe("unavailable");
    expect(result.current.state.feedback.message).toBe(GENERIC_CONNECTION_FAILURE);
    expect(result.current.state.feedback.message).not.toContain("private-google-account@gmail.com");
  });

  it("account collisionは別Userや登録メールを列挙せず汎用エラーへ閉じる", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.createExternalAccount).mockRejectedValue({
      code: "identifier_already_exists",
      errors: [{ longMessage: "already registered by collision-target@example.com" }],
    });
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: false,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.start());

    expect(result.current.state.phase).toBe("unavailable");
    expect(result.current.state.feedback.message).toBe(GENERIC_CONNECTION_FAILURE);
    expect(result.current.state.feedback.message).not.toContain("collision-target@example.com");
    expect(result.current.state.feedback.message).not.toContain("登録済み");
  });

  it("createExternalAccountの応答喪失後はreloadしたverified resourceから成功へ収束する", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const connectedGoogle = googleResource("google-connected", "verified");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.createExternalAccount).mockImplementation(async () => {
      user.externalAccounts = [connectedGoogle];
      throw new Error("response lost");
    });
    const navigate = vi.fn();
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: false,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
        navigateToExternalVerification: navigate,
      }),
    );

    let operationResult: boolean | undefined;
    await act(async () => {
      operationResult = await result.current.start();
    });

    expect(operationResult).toBe(true);
    expect(result.current.state.phase).toBe("methodReady");
    expect(result.current.state.googleAccountId).toBe(connectedGoogle.id);
    expect(result.current.state.feedback.status).toBe("success");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("feature-wide lockが競合を拒否した場合はOAuth副作用を開始しない", async () => {
    const verifiedEmail = emailResource("email-login", false);
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const { result } = renderHook(() =>
      useGoogleConnectionController({
        isLoaded: true,
        user,
        enabled: true,
        flow: "connect-google",
        oauthReturn: false,
        onNeedsReverification: vi.fn(),
        runOperation: async () => undefined,
      }),
    );

    let operationResult: boolean | undefined;
    await act(async () => {
      operationResult = await result.current.start();
    });

    expect(operationResult).toBeUndefined();
    expect(user.createExternalAccount).not.toHaveBeenCalled();
  });
});

function userResource({
  passwordEnabled = false,
  emailAddresses = [],
  externalAccounts = [],
  primaryEmailAddressId = null,
}: {
  passwordEnabled?: boolean;
  emailAddresses?: EmailAddressResource[];
  externalAccounts?: ExternalAccountResource[];
  primaryEmailAddressId?: string | null;
}) {
  const user = {
    passwordEnabled,
    emailAddresses,
    externalAccounts,
    primaryEmailAddressId,
    reload: vi.fn(async () => user),
    createExternalAccount: vi.fn(),
  };
  return user as unknown as UserResource;
}

function emailResource(id: string, linked: boolean) {
  return {
    id,
    emailAddress: `${id}@example.com`,
    verification: { status: "verified" },
    linkedTo: linked ? [{ id: `link-${id}`, type: "oauth_google" }] : [],
  } as unknown as EmailAddressResource;
}

function googleResource(id: string, status: "verified" | "unverified", redirectUrl?: string) {
  return {
    id,
    provider: "google",
    emailAddress: `${id}@gmail.com`,
    verification: {
      status,
      externalVerificationRedirectURL: redirectUrl ? new URL(redirectUrl) : null,
    },
    destroy: vi.fn(),
  } as unknown as ExternalAccountResource;
}
