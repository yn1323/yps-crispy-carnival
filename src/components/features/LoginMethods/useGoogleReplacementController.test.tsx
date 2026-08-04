// @vitest-environment jsdom

import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginMethodOperationRunner } from "./migrationTypes";

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

import { useGoogleReplacementController } from "./useGoogleReplacementController";

const ALL_CAPABILITIES = {
  replaceGoogleAccount: true,
  setPassword: true,
  disconnectGoogle: true,
  connectGoogle: true,
};

beforeEach(() => {
  mocks.reverificationOptions.length = 0;
  mocks.isReverificationCancelledError.mockReset();
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("Google置換controller", () => {
  it("Google linkedメールとパスワードだけでは旧Googleを解除しない", async () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("google-email", true)],
      externalAccounts: [oldGoogle],
    });
    const { result } = renderReplacement(user);

    expect(result.current.state.phase).toBe("ensuringFallback");
    let removalResult: boolean | undefined;
    await act(async () => {
      removalResult = await result.current.removeOldGoogle();
    });

    expect(removalResult).toBe(false);
    expect(oldGoogle.destroy).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe("ensuringFallback");
  });

  it("安全な退避方法を直前に再確認して旧Googleだけを解除する", async () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    vi.mocked(oldGoogle.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
    });
    const onNeedsReverification = vi.fn();
    const { result } = renderReplacement(user, { onNeedsReverification });

    expect(result.current.state.phase).toBe("fallbackReady");
    await act(async () => {
      expect(await result.current.removeOldGoogle()).toBe(true);
    });

    expect(oldGoogle.destroy).toHaveBeenCalledOnce();
    expect(user.createExternalAccount).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe("connectingNewGoogle");
    expect(user.reload).toHaveBeenCalled();
    expect(
      mocks.reverificationOptions.every(
        (options) => (options as { onNeedsReverification?: unknown }).onNeedsReverification === onNeedsReverification,
      ),
    ).toBe(true);
  });

  it("解除応答を失ってもreloadで対象が消えていれば退避方法を残して収束する", async () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    vi.mocked(oldGoogle.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
      throw new Error("response lost");
    });
    const { result } = renderReplacement(user);

    await act(async () => {
      expect(await result.current.removeOldGoogle()).toBe(true);
    });

    expect(result.current.state.phase).toBe("connectingNewGoogle");
    expect(user.passwordEnabled).toBe(true);
    expect(user.emailAddresses).toHaveLength(1);
  });

  it("feature-wide lockが競合を拒否した場合はdestroyを開始しない", async () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    const { result } = renderReplacement(user, { runOperation: async () => undefined });

    let removalResult: boolean | undefined;
    await act(async () => {
      removalResult = await result.current.removeOldGoogle();
    });

    expect(removalResult).toBeUndefined();
    expect(oldGoogle.destroy).not.toHaveBeenCalled();
  });

  it("初回render後にUserが読み込まれても進行中入力を始める前だけ初期化する", () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    const onNeedsReverification = vi.fn();
    const runOperation: LoginMethodOperationRunner = async (operation) => operation();
    const { result, rerender } = renderHook(
      ({ loaded, currentUser }: { loaded: boolean; currentUser: UserResource | null }) =>
        useGoogleReplacementController({
          isLoaded: loaded,
          user: currentUser,
          capabilities: ALL_CAPABILITIES,
          oauthReturn: false,
          onNeedsReverification,
          runOperation,
        }),
      {
        initialProps: { loaded: false, currentUser: null } as {
          loaded: boolean;
          currentUser: UserResource | null;
        },
      },
    );

    expect(result.current.state.phase).toBe("unavailable");
    rerender({ loaded: true, currentUser: user });
    expect(result.current.state.oldGoogleAccountId).toBe("google-old");
    expect(result.current.state.phase).toBe("fallbackReady");
  });

  it("必須capabilityが一つでも無効なら置換をfail-closedにする", async () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    const { result } = renderReplacement(user, {
      capabilities: { ...ALL_CAPABILITIES, disconnectGoogle: false },
    });

    expect(result.current.state.phase).toBe("unavailable");
    await act(async () => {
      expect(await result.current.removeOldGoogle()).toBe(false);
    });
    expect(oldGoogle.destroy).not.toHaveBeenCalled();
  });

  it("Googleが0件または複数件なら置換を開始しない", async () => {
    const noGoogleUser = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [],
    });
    const noGoogle = renderReplacement(noGoogleUser);
    expect(noGoogle.result.current.state.phase).toBe("unavailable");

    const oldGoogle = googleResource("google-old");
    const otherGoogle = googleResource("google-other");
    const multipleUser = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle, otherGoogle],
    });
    const multiple = renderReplacement(multipleUser);
    expect(multiple.result.current.state.phase).toBe("unavailable");
    await act(async () => {
      expect(await multiple.result.current.removeOldGoogle()).toBe(false);
    });
    expect(oldGoogle.destroy).not.toHaveBeenCalled();
    expect(otherGoogle.destroy).not.toHaveBeenCalled();
  });

  it("marker直打ちでは既存Googleを新Google成功扱いにしない", async () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    const onOAuthReturnHandled = vi.fn();
    const { result } = renderReplacement(user, { oauthReturn: true, onOAuthReturnHandled });

    await waitFor(() => expect(onOAuthReturnHandled).toHaveBeenCalledOnce());
    expect(result.current.state.oldGoogleAccountId).toBeNull();
    expect(result.current.state.phase).toBe("unavailable");
    expect(result.current.state.feedback.status).toBe("error");
    expect(result.current.state.feedback.message).not.toContain("変更しました");
    expect(oldGoogle.destroy).not.toHaveBeenCalled();
  });

  it("保持した旧IDと同じGoogleだけがOAuth帰還してもnewGoogleReadyへ進めない", async () => {
    const oldGoogle = googleResource("google-old");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    const onOAuthReturnHandled = vi.fn();
    const runOperation: LoginMethodOperationRunner = async (operation) => operation();
    const { result, rerender } = renderHook(
      ({ oauthReturn }: { oauthReturn: boolean }) =>
        useGoogleReplacementController({
          isLoaded: true,
          user,
          capabilities: ALL_CAPABILITIES,
          oauthReturn,
          onOAuthReturnHandled,
          onNeedsReverification: vi.fn(),
          runOperation,
        }),
      { initialProps: { oauthReturn: false } },
    );

    expect(result.current.state.oldGoogleAccountId).toBe("google-old");
    rerender({ oauthReturn: true });
    await waitFor(() => expect(onOAuthReturnHandled).toHaveBeenCalledOnce());
    expect(result.current.state.phase).toBe("fallbackReady");
    expect(result.current.state.feedback.status).not.toBe("success");
  });

  it("旧Google解除後に旧IDと異なるverified Googleが1件だけ帰還した場合だけ完了する", async () => {
    const oldGoogle = googleResource("google-old");
    const newGoogle = googleResource("google-new");
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [emailResource("fallback", false)],
      externalAccounts: [oldGoogle],
    });
    vi.mocked(oldGoogle.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
    });
    const onOAuthReturnHandled = vi.fn();
    const runOperation: LoginMethodOperationRunner = async (operation) => operation();
    const { result, rerender } = renderHook(
      ({ oauthReturn }: { oauthReturn: boolean }) =>
        useGoogleReplacementController({
          isLoaded: true,
          user,
          capabilities: ALL_CAPABILITIES,
          oauthReturn,
          onOAuthReturnHandled,
          onNeedsReverification: vi.fn(),
          runOperation,
        }),
      { initialProps: { oauthReturn: false } },
    );

    await act(async () => {
      expect(await result.current.removeOldGoogle()).toBe(true);
    });
    expect(result.current.state.oldGoogleAccountId).toBe("google-old");
    expect(result.current.state.phase).toBe("connectingNewGoogle");

    user.externalAccounts = [newGoogle];
    rerender({ oauthReturn: true });
    await waitFor(() => expect(onOAuthReturnHandled).toHaveBeenCalledOnce());
    expect(result.current.state.phase).toBe("newGoogleReady");
    expect(result.current.state.oldGoogleAccountId).toBe("google-old");
    expect(newGoogle.id).not.toBe(result.current.state.oldGoogleAccountId);
  });
});

function renderReplacement(
  user: UserResource,
  overrides: Partial<Parameters<typeof useGoogleReplacementController>[0]> = {},
) {
  const runOperation: LoginMethodOperationRunner = async (operation) => operation();
  return renderHook(() =>
    useGoogleReplacementController({
      isLoaded: true,
      user,
      capabilities: ALL_CAPABILITIES,
      oauthReturn: false,
      onNeedsReverification: vi.fn(),
      runOperation,
      ...overrides,
    }),
  );
}

function userResource({
  passwordEnabled,
  emailAddresses,
  externalAccounts,
}: {
  passwordEnabled: boolean;
  emailAddresses: EmailAddressResource[];
  externalAccounts: ExternalAccountResource[];
}) {
  const user = {
    id: "user-1",
    passwordEnabled,
    emailAddresses,
    externalAccounts,
    primaryEmailAddressId: emailAddresses[0]?.id ?? null,
    reload: vi.fn(async () => user),
    createEmailAddress: vi.fn(),
    updatePassword: vi.fn(),
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

function googleResource(id: string) {
  return {
    id,
    provider: "google",
    emailAddress: `${id}@gmail.com`,
    verification: { status: "verified", externalVerificationRedirectURL: null },
    destroy: vi.fn(),
  } as unknown as ExternalAccountResource;
}
