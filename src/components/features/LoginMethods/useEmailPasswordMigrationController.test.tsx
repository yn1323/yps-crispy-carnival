// @vitest-environment jsdom

import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { act, renderHook } from "@testing-library/react";
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
import { useEmailPasswordMigrationController } from "./useEmailPasswordMigrationController";

beforeEach(() => {
  mocks.reverificationOptions.length = 0;
  mocks.isReverificationCancelledError.mockReset();
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("メールアドレスとパスワードの追加controller", () => {
  it("初回render後にUserが読み込まれても入力開始前の状態を初期化する", () => {
    const user = userResource({
      emailAddresses: [emailResource("google-email", "google@gmail.com", "verified", true)],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: "google-email",
    });
    const onNeedsReverification = vi.fn();
    const runOperation = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const { result, rerender } = renderHook(
      ({ loaded, currentUser }: { loaded: boolean; currentUser: UserResource | null }) =>
        useEmailPasswordMigrationController({
          isLoaded: loaded,
          user: currentUser,
          enabled: true,
          onNeedsReverification,
          runOperation: runOperation as unknown as LoginMethodOperationRunner,
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
    expect(result.current.state.phase).toBe("choosingEmail");
  });

  it("別メールを追加・確認してパスワードを設定し、Googleを自動解除しない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const newEmail = emailResource("email-new", "login@example.com", "unverified");
    const google = googleResource("google-old");
    const user = userResource({
      emailAddresses: [googleEmail],
      externalAccounts: [google],
      primaryEmailAddressId: googleEmail.id,
    });
    vi.mocked(user.createEmailAddress).mockImplementation(async () => {
      user.emailAddresses.push(newEmail);
      return newEmail;
    });
    vi.mocked(user.updatePassword).mockImplementation(async () => {
      user.passwordEnabled = true;
      return user;
    });
    const onNeedsReverification = vi.fn();
    const runOperation = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        enabled: true,
        onNeedsReverification,
        runOperation: runOperation as unknown as LoginMethodOperationRunner,
      }),
    );

    await act(async () => result.current.useDifferentEmail(" Login@Example.com "));
    expect(user.createEmailAddress).toHaveBeenCalledWith({ email: "login@example.com" });
    expect(newEmail.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    expect(result.current.state.phase).toBe("verifyingEmail");

    await act(async () => result.current.verifyEmail("123456"));
    expect(result.current.state.phase).toBe("settingPassword");

    await act(async () => result.current.setPassword({ newPassword: "safe-password", signOutOfOtherSessions: true }));
    expect(user.updatePassword).toHaveBeenCalledWith({
      newPassword: "safe-password",
      signOutOfOtherSessions: true,
    });
    expect(result.current.state.phase).toBe("methodReady");
    expect(result.current.state.safeForGoogleDisconnect).toBe(true);
    expect(google.destroy).not.toHaveBeenCalled();
    expect(runOperation).toHaveBeenCalledTimes(3);
    expect(mocks.reverificationOptions.length).toBeGreaterThanOrEqual(2);
    expect(
      mocks.reverificationOptions.every(
        (options) => (options as { onNeedsReverification?: unknown }).onNeedsReverification === onNeedsReverification,
      ),
    ).toBe(true);
  });

  it("Google linkedの確認済みメールは通常の追加flowで再利用し、Googleを残してパスワードを設定する", async () => {
    const linkedEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const google = googleResource("google-old");
    const user = userResource({
      emailAddresses: [linkedEmail],
      externalAccounts: [google],
      primaryEmailAddressId: linkedEmail.id,
    });
    vi.mocked(user.updatePassword).mockImplementation(async () => {
      user.passwordEnabled = true;
      return user;
    });
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        enabled: true,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useCurrentEmail());

    expect(result.current.state).toMatchObject({
      phase: "settingPassword",
      targetEmailAddressId: linkedEmail.id,
      safeForGoogleDisconnect: false,
    });
    expect(user.createEmailAddress).not.toHaveBeenCalled();

    await act(async () => result.current.setPassword({ newPassword: "safe-password", signOutOfOtherSessions: false }));

    expect(result.current.state.phase).toBe("methodReady");
    expect(result.current.state.safeForGoogleDisconnect).toBe(false);
    expect(google.destroy).not.toHaveBeenCalled();
  });

  it("Google linkedメールだけは置換用fallbackとして受理しない", async () => {
    const linkedEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [linkedEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: linkedEmail.id,
    });
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        enabled: true,
        purpose: "ensure-unlinked-fallback",
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useCurrentEmail());

    expect(result.current.state.phase).toBe("choosingEmail");
    expect(result.current.state.safeForGoogleDisconnect).toBe(false);
    expect(user.updatePassword).not.toHaveBeenCalled();
  });

  it("別accountとのメール衝突を列挙可能な文言へ変換しない", async () => {
    const user = userResource({
      emailAddresses: [emailResource("google-email", "google@gmail.com", "verified", true)],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: "google-email",
    });
    vi.mocked(user.createEmailAddress).mockRejectedValue({
      errors: [{ code: "form_identifier_exists", longMessage: "Email address is already used by another user" }],
    });
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        enabled: true,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useDifferentEmail("collision@example.com"));

    expect(result.current.state.feedback).toEqual({
      status: "error",
      message: "このメールアドレスでは変更を続けられません。別のメールアドレスを入力してください。",
    });
    expect(result.current.state.feedback.message).not.toContain("登録");
    expect(result.current.state.feedback.message).not.toContain("別のユーザー");
  });

  it("feature-wide lockが競合を拒否した場合はClerk副作用を開始しない", async () => {
    const user = userResource({
      emailAddresses: [emailResource("google-email", "google@gmail.com", "verified", true)],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: "google-email",
    });
    const runOperation = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        enabled: true,
        onNeedsReverification: vi.fn(),
        runOperation,
      }),
    );

    let operationResult: boolean | undefined;
    await act(async () => {
      operationResult = await result.current.useDifferentEmail("login@example.com");
    });

    expect(operationResult).toBeUndefined();
    expect(user.createEmailAddress).not.toHaveBeenCalled();
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
    createEmailAddress: vi.fn(),
    updatePassword: vi.fn(),
  };
  return user as unknown as UserResource;
}

function emailResource(id: string, emailAddress: string, status: "verified" | "unverified", linked = false) {
  const resource = {
    id,
    emailAddress,
    verification: { status },
    linkedTo: linked ? [{ id: `link-${id}`, type: "oauth_google" }] : [],
    prepareVerification: vi.fn(async () => resource),
    attemptVerification: vi.fn(async () => {
      resource.verification.status = "verified";
      return resource;
    }),
  };
  return resource as unknown as EmailAddressResource;
}

function googleResource(id: string) {
  return {
    id,
    provider: "google",
    emailAddress: "google@gmail.com",
    verification: { status: "verified" },
    destroy: vi.fn(),
  } as unknown as ExternalAccountResource;
}
