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
  it("reload中にcurrent Userが切り替わればEmailAddress追加を開始しない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const user = userResource({
      emailAddresses: [googleEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
    });
    let currentActorId = user.id;
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      currentActorId = "user-switched";
      return user;
    });
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => currentActorId,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useDifferentEmail("next@example.com"));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(user.updatePassword).not.toHaveBeenCalled();
    expect(result.current.state.feedback.status).toBe("error");
  });

  it("初回render後にUserが読み込まれても入力開始前の状態を初期化する", () => {
    const user = userResource({
      emailAddresses: [emailResource("google-email", "google@gmail.com", "verified", true)],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: "google-email",
    });
    const { result, rerender } = renderHook(
      ({ loaded, currentUser }: { loaded: boolean; currentUser: UserResource | null }) =>
        useEmailPasswordMigrationController({
          isLoaded: loaded,
          user: currentUser,
          getCurrentActorId: () => currentUser?.id ?? null,
          onNeedsReverification: vi.fn(),
          runOperation: async (operation) => operation(),
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
    expect(result.current.state).toMatchObject({
      phase: "choosingEmail",
      targetEmailAddressId: null,
      targetEmailAddress: null,
    });
  });

  it("Googleに紐づく確認済みメールを全文表示して再利用し、同じUserへパスワードだけを追加する", async () => {
    const linkedEmail = emailResource("google-email", "staff@example.com", "verified", true);
    const google = googleResource("google-old");
    const user = userResource({
      id: "user-current",
      emailAddresses: [linkedEmail],
      externalAccounts: [google],
      primaryEmailAddressId: linkedEmail.id,
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
        getCurrentActorId: () => user.id,
        onNeedsReverification,
        runOperation: runOperation as unknown as LoginMethodOperationRunner,
      }),
    );

    await act(async () => result.current.useCurrentEmail());

    expect(result.current.state).toMatchObject({
      phase: "settingPassword",
      targetEmailAddressId: linkedEmail.id,
      targetEmailAddress: linkedEmail.emailAddress,
    });
    expect(user.createEmailAddress).not.toHaveBeenCalled();

    await act(async () => result.current.setPassword({ newPassword: "safe-password", signOutOfOtherSessions: false }));

    expect(user.id).toBe("user-current");
    expect(user.updatePassword).toHaveBeenCalledWith({
      newPassword: "safe-password",
      signOutOfOtherSessions: false,
    });
    expect(result.current.state).toMatchObject({
      phase: "methodReady",
      targetEmailAddress: linkedEmail.emailAddress,
      feedback: { status: "success" },
    });
    expect(google.destroy).not.toHaveBeenCalled();
    expect(runOperation).toHaveBeenCalledTimes(2);
    expect(
      mocks.reverificationOptions.every(
        (options) => (options as { onNeedsReverification?: unknown }).onNeedsReverification === onNeedsReverification,
      ),
    ).toBe(true);
  });

  it("別メールを追加・確認してからパスワードを設定し、Googleを自動解除しない", async () => {
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
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useDifferentEmail(" Login@Example.com "));

    expect(user.createEmailAddress).toHaveBeenCalledWith({ email: "login@example.com" });
    expect(newEmail.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    expect(result.current.state).toMatchObject({
      phase: "verifyingEmail",
      targetEmailAddressId: newEmail.id,
      targetEmailAddress: "login@example.com",
    });

    await act(async () => result.current.verifyEmail("123456"));
    expect(result.current.state.phase).toBe("settingPassword");

    await act(async () => result.current.setPassword({ newPassword: "safe-password", signOutOfOtherSessions: true }));

    expect(result.current.state.phase).toBe("methodReady");
    expect(google.destroy).not.toHaveBeenCalled();
  });

  it("メール確認に失敗した場合は確認待ちに留まり、パスワードとGoogleを変更しない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const pendingEmail = emailResource("email-pending", "pending@example.com", "unverified");
    const google = googleResource("google-old");
    const user = userResource({
      emailAddresses: [googleEmail, pendingEmail],
      externalAccounts: [google],
      primaryEmailAddressId: googleEmail.id,
    });
    vi.mocked(pendingEmail.attemptVerification).mockRejectedValue(new Error("verification failed"));
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useDifferentEmail(pendingEmail.emailAddress));
    await act(async () => result.current.verifyEmail("wrong-code"));

    expect(result.current.state).toMatchObject({
      phase: "verifyingEmail",
      targetEmailAddress: pendingEmail.emailAddress,
      feedback: { status: "error" },
    });
    expect(user.updatePassword).not.toHaveBeenCalled();
    expect(google.destroy).not.toHaveBeenCalled();
  });

  it("パスワード設定の応答を失っても同じUserの再取得結果からだけ完了へ復旧する", async () => {
    const linkedEmail = emailResource("google-email", "staff@example.com", "verified", true);
    const google = googleResource("google-old");
    const user = userResource({
      id: "user-current",
      emailAddresses: [linkedEmail],
      externalAccounts: [google],
      primaryEmailAddressId: linkedEmail.id,
    });
    vi.mocked(user.updatePassword).mockImplementation(async () => {
      user.passwordEnabled = true;
      throw new Error("response lost");
    });
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useCurrentEmail());
    let completed: boolean | undefined;
    await act(async () => {
      completed = await result.current.setPassword({
        newPassword: "safe-password",
        signOutOfOtherSessions: false,
      });
    });

    expect(completed).toBe(true);
    expect(user.id).toBe("user-current");
    expect(result.current.state).toMatchObject({
      phase: "methodReady",
      targetEmailAddress: linkedEmail.emailAddress,
      feedback: { status: "success" },
    });
    expect(google.destroy).not.toHaveBeenCalled();
  });

  it("操作中にUser IDが変わった場合は別Userへパスワードを設定しない", async () => {
    const linkedEmail = emailResource("google-email", "staff@example.com", "verified", true);
    const user = userResource({
      id: "user-start",
      emailAddresses: [linkedEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: linkedEmail.id,
    });
    vi.mocked(user.reload).mockImplementation(async () => {
      Object.assign(user, { id: "user-return" });
      return user;
    });
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useCurrentEmail());

    expect(result.current.state.feedback.status).toBe("error");
    expect(user.updatePassword).not.toHaveBeenCalled();
  });

  it("同じ操作を連打してもClerk副作用はsingle-flightで一度だけ開始する", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const newEmail = emailResource("email-new", "login@example.com", "unverified");
    const user = userResource({
      emailAddresses: [googleEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
    });
    const gate = deferred<void>();
    vi.mocked(user.reload).mockImplementation(async () => {
      await gate.promise;
      return user;
    });
    vi.mocked(user.createEmailAddress).mockImplementation(async () => {
      user.emailAddresses.push(newEmail);
      return newEmail;
    });
    const runOperation = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification: vi.fn(),
        runOperation: runOperation as unknown as LoginMethodOperationRunner,
      }),
    );

    let first = Promise.resolve<boolean | undefined>(undefined);
    let second = Promise.resolve<boolean | undefined>(undefined);
    act(() => {
      first = result.current.useDifferentEmail(newEmail.emailAddress);
      second = result.current.useDifferentEmail(newEmail.emailAddress);
    });
    gate.resolve();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBeUndefined();
    expect(user.createEmailAddress).toHaveBeenCalledOnce();
    expect(newEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(runOperation).toHaveBeenCalledOnce();
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
        getCurrentActorId: () => user.id,
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
});

function userResource({
  id = "user-current",
  passwordEnabled = false,
  emailAddresses = [],
  externalAccounts = [],
  primaryEmailAddressId = null,
}: {
  id?: string;
  passwordEnabled?: boolean;
  emailAddresses?: EmailAddressResource[];
  externalAccounts?: ExternalAccountResource[];
  primaryEmailAddressId?: string | null;
} = {}) {
  const user = {
    id,
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

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
