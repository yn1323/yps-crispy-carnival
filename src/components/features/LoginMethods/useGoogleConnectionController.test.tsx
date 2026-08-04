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

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.reverificationOptions.length = 0;
  mocks.isReverificationCancelledError.mockReset();
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("Google接続controller", () => {
  it("reload中にcurrent Userが切り替わればOAuth副作用を開始しない", async () => {
    const user = userResource();
    let currentActorId = user.id;
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      currentActorId = "user-switched";
      return user;
    });
    const { result } = renderGoogleHook({ user, getCurrentActorId: () => currentActorId });

    await act(async () => result.current.start());

    expect(user.createExternalAccount).not.toHaveBeenCalled();
    expect(result.current.state.feedback.status).toBe("error");
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("current Userのaccount-management OAuthだけを相関情報付きで開始する", async () => {
    const loginEmail = emailResource("email-login", "login@example.com");
    const pendingGoogle = googleResource({
      id: "google-new",
      status: "unverified",
      emailAddress: "new-google@example.com",
      redirectUrl: "https://accounts.example.test/authorize",
    });
    const user = userResource({ emailAddresses: [loginEmail] });
    vi.mocked(user.createExternalAccount).mockImplementation(async () => {
      user.externalAccounts = [pendingGoogle];
      return pendingGoogle;
    });
    const onNeedsReverification = vi.fn();
    const runOperation = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const navigate = vi.fn();
    const { result } = renderGoogleHook({
      user,
      onNeedsReverification,
      runOperation: runOperation as unknown as LoginMethodOperationRunner,
      navigateToExternalVerification: navigate,
    });

    await act(async () => result.current.start());

    expect(user.createExternalAccount).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl: "/account/security?flow=connect-google&oauth=google",
      oidcPrompt: "select_account",
    });
    expect(navigate).toHaveBeenCalledWith("https://accounts.example.test/authorize");
    expect(navigate.mock.calls[0]?.[0]).not.toContain(user.id);
    expect(navigate.mock.calls[0]?.[0]).not.toContain(pendingGoogle.id);
    expect(navigate.mock.calls[0]?.[0]).not.toContain(pendingGoogle.emailAddress);
    expect(readOnlyStoredCorrelation()).toEqual({
      version: 1,
      userId: user.id,
      externalAccountId: pendingGoogle.id,
      primaryEmailAddressId: user.primaryEmailAddressId,
      passwordEnabled: true,
    });
    expect(runOperation).toHaveBeenCalledOnce();
    expect(
      mocks.reverificationOptions.every(
        (options) => (options as { onNeedsReverification?: unknown }).onNeedsReverification === onNeedsReverification,
      ),
    ).toBe(true);
  });

  it("OAuth resource作成中に開始時のPrimaryが変われば即時確認済みでも成功にしない", async () => {
    const originalEmail = emailResource("email-original", "original@example.com");
    const connectedGoogle = googleResource({
      id: "google-immediately-verified",
      status: "verified",
      emailAddress: "selected-google@example.com",
    });
    const user = userResource({ emailAddresses: [originalEmail] });
    vi.mocked(user.createExternalAccount).mockImplementation(async () => {
      const changedPrimary = emailResource("email-changed", "changed@example.com");
      user.emailAddresses = [
        originalEmail,
        changedPrimary,
        emailResource("email-google", connectedGoogle.emailAddress),
      ];
      user.primaryEmailAddressId = changedPrimary.id;
      user.externalAccounts = [connectedGoogle];
      return connectedGoogle;
    });
    const navigate = vi.fn();
    const { result } = renderGoogleHook({ user, navigateToExternalVerification: navigate });

    await act(async () => result.current.start());

    expect(result.current.state.errorKind).toBe("clerkConflict");
    expect(result.current.state.phase).toBe("unavailable");
    expect(navigate).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("reload後も開始Userとexact accountを相関し、verified email所有まで確認して成功する", async () => {
    const loginEmail = emailResource("email-login", "login@example.com");
    const pendingGoogle = googleResource({
      id: "google-correlated",
      status: "unverified",
      emailAddress: "selected-google@example.com",
      redirectUrl: "https://accounts.example.test/authorize",
    });
    const user = userResource({ emailAddresses: [loginEmail] });
    vi.mocked(user.createExternalAccount).mockImplementation(async () => {
      user.externalAccounts = [pendingGoogle];
      return pendingGoogle;
    });
    const firstMount = renderGoogleHook({ user, navigateToExternalVerification: vi.fn() });
    await act(async () => firstMount.result.current.start());
    firstMount.unmount();

    const connectedGoogle = googleResource({
      id: pendingGoogle.id,
      status: "verified",
      emailAddress: pendingGoogle.emailAddress,
    });
    const unrelatedGoogle = googleResource({
      id: "google-unrelated",
      status: "verified",
      emailAddress: "unrelated-google@example.com",
    });
    user.externalAccounts = [unrelatedGoogle, connectedGoogle];
    user.emailAddresses = [loginEmail, emailResource("email-google", connectedGoogle.emailAddress)];
    const onHandled = vi.fn();
    const secondMount = renderGoogleHook({ user, oauthReturn: true, onOAuthReturnHandled: onHandled });

    await waitFor(() => expect(secondMount.result.current.state.phase).toBe("methodReady"));

    expect(secondMount.result.current.state.googleAccountId).toBe(connectedGoogle.id);
    expect(secondMount.result.current.state.emailAddress).toBe(connectedGoogle.emailAddress);
    expect(secondMount.result.current.state.feedback).toEqual({
      status: "success",
      message: "Googleログインを追加しました。",
    });
    expect(user.reload).toHaveBeenCalledTimes(3);
    expect(onHandled).toHaveBeenCalledOnce();
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("相関した開始Userと帰還時のUserが違えばresourceを利用可能にしない", async () => {
    const pendingGoogle = googleResource({
      id: "google-correlated",
      status: "unverified",
      emailAddress: "selected-google@example.com",
      redirectUrl: "https://accounts.example.test/authorize",
    });
    const startingUser = userResource({ id: "user-start" });
    vi.mocked(startingUser.createExternalAccount).mockImplementation(async () => {
      startingUser.externalAccounts = [pendingGoogle];
      return pendingGoogle;
    });
    const firstMount = renderGoogleHook({ user: startingUser, navigateToExternalVerification: vi.fn() });
    await act(async () => firstMount.result.current.start());
    firstMount.unmount();

    const returningUser = userResource({
      id: "user-return",
      emailAddresses: [emailResource("email-google", pendingGoogle.emailAddress)],
      externalAccounts: [
        googleResource({
          id: pendingGoogle.id,
          status: "verified",
          emailAddress: pendingGoogle.emailAddress,
        }),
      ],
    });
    const { result } = renderGoogleHook({ user: returningUser, oauthReturn: true });

    await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));

    expect(returningUser.reload).toHaveBeenCalledOnce();
    expect(result.current.state.errorKind).toBe("clerkConflict");
    expect(result.current.state.phase).toBe("unavailable");
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("OAuth中にPrimaryメールまたはパスワード状態が変わった場合は追加成功にしない", async () => {
    const { user, pendingGoogle, unmount } = await startPersistedConnection();
    unmount();
    const changedPrimary = emailResource("email-changed-primary", "changed@example.com");
    user.emailAddresses = [changedPrimary, emailResource("email-google", pendingGoogle.emailAddress)];
    user.primaryEmailAddressId = changedPrimary.id;
    user.externalAccounts = [
      googleResource({ id: pendingGoogle.id, status: "verified", emailAddress: pendingGoogle.emailAddress }),
    ];

    const { result } = renderGoogleHook({ user, oauthReturn: true });
    await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));

    expect(result.current.state.errorKind).toBe("clerkConflict");
    expect(result.current.state.phase).toBe("unavailable");
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("相関情報のないOAuth帰還ではcurrent Userのverified Googleを推測採用しない", async () => {
    const connectedGoogle = googleResource({
      id: "google-existing",
      status: "verified",
      emailAddress: "existing-google@example.com",
    });
    const user = userResource({
      emailAddresses: [emailResource("email-google", connectedGoogle.emailAddress)],
      externalAccounts: [connectedGoogle],
    });

    const { result } = renderGoogleHook({ user, oauthReturn: true });
    await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));

    expect(result.current.state.errorKind).toBe("clerkConflict");
    expect(result.current.state.googleAccountId).toBeNull();
    expect(result.current.state.emailAddress).toBeNull();
  });

  it("利用者が再確認した時は既存のverified Googleを成功通知なしでoverviewへ収束できる", async () => {
    const connectedGoogle = googleResource({
      id: "google-existing",
      status: "verified",
      emailAddress: "existing-google@example.com",
    });
    const user = userResource({
      emailAddresses: [emailResource("email-google", connectedGoogle.emailAddress)],
      externalAccounts: [connectedGoogle],
    });
    const { result } = renderGoogleHook({ user });

    await act(async () => result.current.refresh());

    expect(result.current.state.phase).toBe("methodReady");
    expect(result.current.state.googleAccountId).toBe(connectedGoogle.id);
    expect(result.current.state.feedback).toEqual({ status: "idle", message: null });
  });

  it("exact accountがGoogleでなければ同じidでも成功扱いにしない", async () => {
    const { user, pendingGoogle, unmount } = await startPersistedConnection();
    unmount();
    user.externalAccounts = [
      externalAccountResource({
        id: pendingGoogle.id,
        provider: "github",
        status: "verified",
        emailAddress: pendingGoogle.emailAddress,
      }),
    ];
    user.emailAddresses = [emailResource("email-google", pendingGoogle.emailAddress)];

    const { result } = renderGoogleHook({ user, oauthReturn: true });
    await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));

    expect(result.current.state.errorKind).toBe("clerkConflict");
    expect(result.current.state.googleAccountId).toBeNull();
  });

  it("exact Googleがverifiedでも対応するverified email resourceを所有しなければ成功扱いにしない", async () => {
    const { user, pendingGoogle, unmount } = await startPersistedConnection();
    unmount();
    user.externalAccounts = [
      googleResource({
        id: pendingGoogle.id,
        status: "verified",
        emailAddress: pendingGoogle.emailAddress,
      }),
    ];
    user.emailAddresses = [emailResource("email-other", "other@example.com")];

    const { result } = renderGoogleHook({ user, oauthReturn: true });
    await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));

    expect(result.current.state.errorKind).toBe("clerkConflict");
    expect(result.current.state.feedback.message).not.toContain(pendingGoogle.emailAddress);
  });

  it.each([
    {
      clerkCode: "oauth_access_denied",
      expectedKind: "providerCancelled",
      expectedMessage: "Googleアカウントの追加をキャンセルしました。現在のログイン方法は変更されていません。",
    },
    {
      clerkCode: "oauth_identification_claimed",
      expectedKind: "accountCollision",
      expectedMessage:
        "このGoogleアカウントは追加できません。別のGoogleアカウントを選んでください。現在のログイン方法は変更されていません。",
    },
    {
      clerkCode: "oauth_account_already_connected",
      expectedKind: "alreadyConnected",
      expectedMessage:
        "このGoogleアカウントはすでに接続されています。画面を再読み込みして最新の状態を確認してください。",
    },
  ])(
    "OAuth帰還時の$clerkCodeを識別子なしの専用エラーへ分ける",
    async ({ clerkCode, expectedKind, expectedMessage }) => {
      const { user, pendingGoogle, unmount } = await startPersistedConnection();
      unmount();
      user.externalAccounts = [
        googleResource({
          id: pendingGoogle.id,
          status: "failed",
          emailAddress: "private-google-account@example.com",
          errorCode: clerkCode,
        }),
      ];

      const { result } = renderGoogleHook({ user, oauthReturn: true });
      await waitFor(() => expect(result.current.state.feedback.status).toBe("error"));

      expect(result.current.state.errorKind).toBe(expectedKind);
      expect(result.current.state.feedback.message).toBe(expectedMessage);
      expect(result.current.state.feedback.message).not.toContain("private-google-account@example.com");
      expect(window.sessionStorage).toHaveLength(0);
    },
  );

  it("Clerk identifier conflictをprovider collisionとは別の状態へ分ける", async () => {
    const user = userResource();
    vi.mocked(user.createExternalAccount).mockRejectedValue({
      errors: [
        {
          code: "identifier_already_exists",
          longMessage: "already registered by private-account@example.com",
        },
      ],
    });
    const { result } = renderGoogleHook({ user });

    await act(async () => result.current.start());

    expect(result.current.state.errorKind).toBe("clerkConflict");
    expect(result.current.state.feedback.message).not.toContain("private-account@example.com");
  });

  it("一般的なprovider失敗はresponseを表示せず再試行可能エラーにする", async () => {
    const user = userResource();
    vi.mocked(user.createExternalAccount).mockRejectedValue(
      new Error("provider failed for private-google-account@example.com"),
    );
    const { result } = renderGoogleHook({ user });

    await act(async () => result.current.start());

    expect(result.current.state.errorKind).toBe("retryable");
    expect(result.current.state.feedback.message).toBe(
      "Googleログインを追加できませんでした。現在のログイン方法は変更されていません。もう一度お試しください。",
    );
    expect(result.current.state.feedback.message).not.toContain("private-google-account@example.com");
  });

  it("createExternalAccountの応答喪失後は開始前との差分が一意なresourceだけを復旧する", async () => {
    const pendingGoogle = googleResource({
      id: "google-created-after-response-loss",
      status: "unverified",
      emailAddress: "selected-google@example.com",
      redirectUrl: "https://accounts.example.test/authorize",
    });
    const user = userResource();
    vi.mocked(user.createExternalAccount).mockImplementation(async () => {
      user.externalAccounts = [pendingGoogle];
      throw new Error("response lost");
    });
    const navigate = vi.fn();
    const { result } = renderGoogleHook({ user, navigateToExternalVerification: navigate });

    let operationResult: boolean | undefined;
    await act(async () => {
      operationResult = await result.current.start();
    });

    expect(operationResult).toBe(true);
    expect(result.current.state.phase).toBe("redirecting");
    expect(navigate).toHaveBeenCalledWith("https://accounts.example.test/authorize");
    expect(readOnlyStoredCorrelation()).toEqual({
      version: 1,
      userId: user.id,
      externalAccountId: pendingGoogle.id,
      primaryEmailAddressId: user.primaryEmailAddressId,
      passwordEnabled: true,
    });
  });

  it("応答喪失時に新しいGoogle resourceが複数あれば既存resourceを推測採用しない", async () => {
    const user = userResource();
    vi.mocked(user.createExternalAccount).mockImplementation(async () => {
      user.externalAccounts = [
        googleResource({
          id: "google-a",
          status: "verified",
          emailAddress: "google-a@example.com",
        }),
        googleResource({
          id: "google-b",
          status: "verified",
          emailAddress: "google-b@example.com",
        }),
      ];
      throw new Error("response lost");
    });
    const { result } = renderGoogleHook({ user });

    await act(async () => result.current.start());

    expect(result.current.state.errorKind).toBe("retryable");
    expect(result.current.state.googleAccountId).toBeNull();
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("本人再確認を取り消した時はOAuth resourceも相関情報も作らない", async () => {
    const cancellation = new Error("cancelled");
    mocks.isReverificationCancelledError.mockImplementation((error) => error === cancellation);
    const user = userResource();
    vi.mocked(user.createExternalAccount).mockRejectedValue(cancellation);
    const { result } = renderGoogleHook({ user });

    let operationResult: boolean | undefined;
    await act(async () => {
      operationResult = await result.current.start();
    });

    expect(operationResult).toBe(false);
    expect(result.current.state.phase).toBe("readyToConnect");
    expect(result.current.state.feedback).toEqual({ status: "idle", message: null });
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("同じmountへOAuth callback markerが再送されても一度だけclaimする", async () => {
    const { user, pendingGoogle, unmount } = await startPersistedConnection();
    unmount();
    user.externalAccounts = [
      googleResource({
        id: pendingGoogle.id,
        status: "verified",
        emailAddress: pendingGoogle.emailAddress,
      }),
    ];
    user.emailAddresses = [emailResource("email-google", pendingGoogle.emailAddress)];
    const onHandled = vi.fn();
    const { result, rerender } = renderHook(
      ({ oauthReturn }: { oauthReturn: boolean }) =>
        useGoogleConnectionController({
          isLoaded: true,
          user,
          getCurrentActorId: () => user.id,
          oauthReturn,
          onOAuthReturnHandled: onHandled,
          onNeedsReverification: vi.fn(),
          runOperation: async (operation) => operation(),
        }),
      { initialProps: { oauthReturn: true } },
    );

    await waitFor(() => expect(result.current.state.phase).toBe("methodReady"));
    const reloadCountAfterSettlement = vi.mocked(user.reload).mock.calls.length;

    rerender({ oauthReturn: false });
    rerender({ oauthReturn: true });
    expect(onHandled).toHaveBeenCalledOnce();
    expect(user.reload).toHaveBeenCalledTimes(reloadCountAfterSettlement);
  });

  it("startの二重実行は単一flightにまとめる", async () => {
    let resolveCreation: ((account: ExternalAccountResource) => void) | undefined;
    const creation = new Promise<ExternalAccountResource>((resolve) => {
      resolveCreation = resolve;
    });
    const pendingGoogle = googleResource({
      id: "google-new",
      status: "unverified",
      emailAddress: "selected-google@example.com",
      redirectUrl: "https://accounts.example.test/authorize",
    });
    const user = userResource();
    vi.mocked(user.createExternalAccount).mockReturnValue(creation);
    const { result } = renderGoogleHook({ user, navigateToExternalVerification: vi.fn() });

    let first: Promise<boolean | undefined> | undefined;
    let secondResult: boolean | undefined;
    await act(async () => {
      first = result.current.start();
      secondResult = await result.current.start();
    });

    expect(secondResult).toBeUndefined();
    expect(user.createExternalAccount).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCreation?.(pendingGoogle);
      await first;
    });
  });

  it("feature-wide lockが競合を拒否した場合はOAuth副作用を開始しない", async () => {
    const user = userResource();
    const { result } = renderGoogleHook({ user, runOperation: async () => undefined });

    let operationResult: boolean | undefined;
    await act(async () => {
      operationResult = await result.current.start();
    });

    expect(operationResult).toBeUndefined();
    expect(user.createExternalAccount).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(0);
  });
});

function renderGoogleHook({
  user,
  oauthReturn = false,
  onOAuthReturnHandled,
  onNeedsReverification = vi.fn(),
  runOperation = async (operation) => operation(),
  navigateToExternalVerification,
  getCurrentActorId = () => user.id,
}: {
  user: UserResource;
  oauthReturn?: boolean;
  onOAuthReturnHandled?: () => void;
  onNeedsReverification?: Parameters<typeof useGoogleConnectionController>[0]["onNeedsReverification"];
  runOperation?: LoginMethodOperationRunner;
  navigateToExternalVerification?: (url: string) => void;
  getCurrentActorId?: () => string | null;
}) {
  return renderHook(() =>
    useGoogleConnectionController({
      isLoaded: true,
      user,
      getCurrentActorId,
      oauthReturn,
      onOAuthReturnHandled,
      onNeedsReverification,
      runOperation,
      navigateToExternalVerification,
    }),
  );
}

async function startPersistedConnection() {
  const pendingGoogle = googleResource({
    id: "google-correlated",
    status: "unverified",
    emailAddress: "selected-google@example.com",
    redirectUrl: "https://accounts.example.test/authorize",
  });
  const user = userResource();
  vi.mocked(user.createExternalAccount).mockImplementation(async () => {
    user.externalAccounts = [pendingGoogle];
    return pendingGoogle;
  });
  const hook = renderGoogleHook({ user, navigateToExternalVerification: vi.fn() });
  await act(async () => hook.result.current.start());
  return { user, pendingGoogle, unmount: hook.unmount };
}

function readOnlyStoredCorrelation() {
  expect(window.sessionStorage).toHaveLength(1);
  const key = window.sessionStorage.key(0);
  expect(key).not.toBeNull();
  const value = window.sessionStorage.getItem(key as string);
  expect(value).not.toBeNull();
  return JSON.parse(value as string) as unknown;
}

function userResource({
  id = "user-current",
  passwordEnabled = true,
  emailAddresses = [emailResource("email-login", "login@example.com")],
  externalAccounts = [],
}: {
  id?: string;
  passwordEnabled?: boolean;
  emailAddresses?: EmailAddressResource[];
  externalAccounts?: ExternalAccountResource[];
} = {}) {
  const user = {
    id,
    passwordEnabled,
    emailAddresses,
    externalAccounts,
    primaryEmailAddressId: emailAddresses[0]?.id ?? null,
    reload: vi.fn(async () => user),
    createExternalAccount: vi.fn(),
  };
  return user as unknown as UserResource;
}

function emailResource(id: string, emailAddress: string, status: "verified" | "unverified" = "verified") {
  return {
    id,
    emailAddress,
    verification: { status },
    linkedTo: [],
  } as unknown as EmailAddressResource;
}

function googleResource({
  id,
  status,
  emailAddress,
  redirectUrl,
  errorCode,
}: {
  id: string;
  status: "verified" | "unverified" | "failed";
  emailAddress: string;
  redirectUrl?: string;
  errorCode?: string;
}) {
  return externalAccountResource({
    id,
    provider: "google",
    status,
    emailAddress,
    redirectUrl,
    errorCode,
  });
}

function externalAccountResource({
  id,
  provider,
  status,
  emailAddress,
  redirectUrl,
  errorCode,
}: {
  id: string;
  provider: "google" | "github";
  status: "verified" | "unverified" | "failed";
  emailAddress: string;
  redirectUrl?: string;
  errorCode?: string;
}) {
  return {
    id,
    provider,
    emailAddress,
    verification: {
      status,
      error: errorCode ? { code: errorCode, message: "provider details must not be rendered" } : null,
      externalVerificationRedirectURL: redirectUrl ? new URL(redirectUrl) : null,
    },
    destroy: vi.fn(),
  } as unknown as ExternalAccountResource;
}
