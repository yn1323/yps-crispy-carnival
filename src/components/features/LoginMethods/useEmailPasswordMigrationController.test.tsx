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
import type { LoginMethodOperationOptions } from "./reverificationTypes";
import { useEmailPasswordMigrationController } from "./useEmailPasswordMigrationController";

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.reverificationOptions.length = 0;
  mocks.isReverificationCancelledError.mockReset();
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("メールアドレスとパスワードの追加controller", () => {
  it("同じUserでflowを開き直す時もreloadした最新状態から再開する", async () => {
    const linkedEmail = emailResource("google-email", "staff@example.com", "verified", true);
    const user = userResource({
      emailAddresses: [linkedEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: linkedEmail.id,
    });
    vi.mocked(user.updatePassword).mockImplementation(async () => {
      user.passwordEnabled = true;
      return user;
    });
    const getCurrentActorId = () => user.id;
    const { result, rerender } = renderHook(
      ({ active, currentUser }: { active: boolean; currentUser: UserResource }) =>
        useEmailPasswordMigrationController({
          isLoaded: true,
          user: currentUser,
          getCurrentActorId,
          active,
          onNeedsReverification: vi.fn(),
          runOperation: async (operation) => operation(),
        }),
      { initialProps: { active: true, currentUser: user } },
    );

    await act(async () => result.current.useDifferentEmail(linkedEmail.emailAddress));
    await act(async () => result.current.setPassword("safe-password"));
    expect(result.current.state).toMatchObject({ phase: "methodReady", feedback: { status: "success" } });

    rerender({ active: false, currentUser: user });
    await waitFor(() => expect(result.current.state.feedback.status).toBe("idle"));

    const latestUser = userResource({
      id: user.id,
      emailAddresses: [linkedEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: linkedEmail.id,
    });
    const gate = deferred<void>();
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      await gate.promise;
      return user;
    });
    rerender({ active: true, currentUser: user });
    expect(result.current.state.phase).toBe("loading");
    rerender({ active: true, currentUser: latestUser });

    await act(async () => gate.resolve());
    await waitFor(() => expect(result.current.state.phase).toBe("choosingEmail"));
    expect(result.current.state.feedback).toEqual({ status: "idle", message: null });
  });

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
      targetEmailAddress: "google@gmail.com",
    });
  });

  it("メール・パスワード初回設定では現在の確認済みGoogleメールを初期値にする", () => {
    const google = googleResource("google-old");
    const user = userResource({ externalAccounts: [google] });

    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    expect(result.current.state).toMatchObject({
      phase: "choosingEmail",
      targetEmailAddressId: null,
      targetEmailAddress: google.emailAddress,
    });
  });

  it("再表示時はGoogle accountのメールより現在の確認済みPrimaryを初期値にする", () => {
    const primaryEmail = emailResource("email-primary", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [primaryEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: primaryEmail.id,
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

    expect(result.current.state).toMatchObject({
      phase: "choosingEmail",
      targetEmailAddressId: null,
      targetEmailAddress: primaryEmail.emailAddress,
    });
  });

  it("Googleに紐づく確認済みPrimaryを再利用し、同じUserへパスワードだけを追加する", async () => {
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
    const runOperation = vi.fn(async (operation: () => Promise<unknown>, _options?: LoginMethodOperationOptions) =>
      operation(),
    );
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification,
        runOperation: runOperation as unknown as LoginMethodOperationRunner,
      }),
    );

    await act(async () => result.current.useDifferentEmail(linkedEmail.emailAddress));

    expect(result.current.state).toMatchObject({
      phase: "settingPassword",
      targetEmailAddressId: linkedEmail.id,
      targetEmailAddress: linkedEmail.emailAddress,
    });
    expect(user.createEmailAddress).not.toHaveBeenCalled();

    await act(async () => result.current.setPassword("safe-password"));

    expect(user.id).toBe("user-current");
    expect(user.updatePassword).toHaveBeenCalledWith({
      newPassword: "safe-password",
      signOutOfOtherSessions: false,
    });
    expect(user.update).not.toHaveBeenCalled();
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

  it("別メールを追加・確認してPrimaryにしてからパスワードを設定し、Googleを自動解除しない", async () => {
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

    await act(async () => result.current.setPassword("safe-password"));

    expect(result.current.state.phase).toBe("methodReady");
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: newEmail.id });
    expect(user.primaryEmailAddressId).toBe(newEmail.id);
    expect(vi.mocked(user.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(user.updatePassword).mock.invocationCallOrder[0] ?? 0,
    );
    expect(user.emailAddresses.filter((emailAddress) => emailAddress.linkedTo.some(isGoogleLink))).toEqual([
      googleEmail,
    ]);
    expect(google.destroy).not.toHaveBeenCalled();
  });

  it("Primary更新後にGoogle linked EmailAddressの状態が変わればパスワードを設定しない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
    });
    vi.mocked(user.update).mockImplementation(async ({ primaryEmailAddressId }) => {
      user.primaryEmailAddressId = primaryEmailAddressId ?? null;
      Object.assign(googleEmail, { linkedTo: [] });
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    let completed: boolean | undefined;
    await act(async () => {
      completed = await result.current.setPassword("safe-password");
    });

    expect(completed).toBe(false);
    expect(user.updatePassword).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      phase: "settingPassword",
      feedback: { status: "error" },
    });
  });

  it("メール選択後に別のPrimaryへ変わった場合はその変更を上書きしない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const otherEmail = emailResource("email-other", "other@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail, otherEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    user.primaryEmailAddressId = otherEmail.id;
    const completed = await act(async () => result.current.setPassword("safe-password"));

    expect(completed).toBe(false);
    expect(user.primaryEmailAddressId).toBe(otherEmail.id);
    expect(user.update).not.toHaveBeenCalled();
    expect(user.updatePassword).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ phase: "settingPassword", feedback: { status: "error" } });
  });

  it("メール選択後にGoogle ExternalAccountが消えた場合はPrimaryもパスワードも変更しない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    user.externalAccounts = [];
    const completed = await act(async () => result.current.setPassword("safe-password"));

    expect(completed).toBe(false);
    expect(user.primaryEmailAddressId).toBe(googleEmail.id);
    expect(user.update).not.toHaveBeenCalled();
    expect(user.updatePassword).not.toHaveBeenCalled();
  });

  it("メール選択後に別操作でパスワードが有効化されても入力パスワードを設定済みとみなさない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    user.passwordEnabled = true;
    const completed = await act(async () => result.current.setPassword("safe-password"));

    expect(completed).toBe(false);
    expect(user.primaryEmailAddressId).toBe(googleEmail.id);
    expect(user.update).not.toHaveBeenCalled();
    expect(user.updatePassword).not.toHaveBeenCalled();
    expect(result.current.state.feedback.status).toBe("error");
  });

  it("確認待ちの間にGoogle状態が変わった場合は確認副作用を開始しない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const pendingEmail = emailResource("email-pending", "login@example.com", "unverified");
    const user = userResource({
      emailAddresses: [googleEmail, pendingEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
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

    await act(async () => result.current.useDifferentEmail(pendingEmail.emailAddress));
    user.externalAccounts = [];
    const verified = await act(async () => result.current.verifyEmail("123456"));

    expect(verified).toBe(false);
    expect(pendingEmail.attemptVerification).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    expect(user.updatePassword).not.toHaveBeenCalled();
  });

  it("初回送信と再送は同じメールのcooldownを共有し、30秒後にだけ再送する", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const pendingEmail = emailResource("email-pending", "pending@example.com", "unverified");
    const user = userResource({
      emailAddresses: [googleEmail, pendingEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
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

    await act(async () => result.current.useDifferentEmail(pendingEmail.emailAddress));
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();

    await act(async () => result.current.resendEmailCode());
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.state.feedback).toEqual({
      status: "error",
      message: "確認コードを送信した直後です。あと30秒ほど待ってから再送してください。",
    });

    now.mockReturnValue(1_030_000);
    await act(async () => result.current.resendEmailCode());
    expect(pendingEmail.prepareVerification).toHaveBeenCalledTimes(2);
    expect(result.current.state.feedback).toEqual({
      status: "success",
      message: "新しい確認コードを送りました。",
    });

    now.mockRestore();
  });

  it("初回送信の応答を失っても同じメールのcooldownを維持する", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const pendingEmail = emailResource("email-pending", "pending@example.com", "unverified");
    vi.mocked(pendingEmail.prepareVerification).mockRejectedValueOnce(new Error("response lost"));
    const user = userResource({
      emailAddresses: [googleEmail, pendingEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
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

    await act(async () => result.current.useDifferentEmail(pendingEmail.emailAddress));
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({
      phase: "verifyingEmail",
      targetEmailAddressId: pendingEmail.id,
    });

    await act(async () => result.current.resendEmailCode());
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.state.feedback.message).toContain("あと30秒");

    now.mockRestore();
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

  it("Primary更新後にパスワード設定の応答を失っても有効化済みなら完了へ復旧する", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const google = googleResource("google-old");
    const user = userResource({
      id: "user-current",
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [google],
      primaryEmailAddressId: googleEmail.id,
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    let completed: boolean | undefined;
    await act(async () => {
      completed = await result.current.setPassword("safe-password");
    });

    expect(completed).toBe(true);
    expect(user.id).toBe("user-current");
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: targetEmail.id });
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(result.current.state).toMatchObject({
      phase: "methodReady",
      targetEmailAddress: targetEmail.emailAddress,
      feedback: { status: "success" },
    });
    expect(google.destroy).not.toHaveBeenCalled();
  });

  it("Primary更新後にパスワード設定が失敗した場合はtarget Primaryのまま再試行できる", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
    });
    vi.mocked(user.updatePassword)
      .mockRejectedValueOnce(new Error("password update failed"))
      .mockImplementationOnce(async () => {
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    let firstResult: boolean | undefined;
    await act(async () => {
      firstResult = await result.current.setPassword("safe-password");
    });

    expect(firstResult).toBe(false);
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(user.passwordEnabled).toBe(false);
    expect(result.current.state).toMatchObject({
      phase: "settingPassword",
      targetEmailAddressId: targetEmail.id,
      feedback: { status: "error" },
    });

    let retryResult: boolean | undefined;
    await act(async () => {
      retryResult = await result.current.setPassword("safe-password");
    });

    expect(retryResult).toBe(true);
    expect(user.update).toHaveBeenCalledOnce();
    expect(user.updatePassword).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({
      phase: "methodReady",
      targetEmailAddressId: targetEmail.id,
      feedback: { status: "success" },
    });
  });

  it("Primary更新の応答を失っても再取得したtarget Primaryからパスワード設定を続ける", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const google = googleResource("google-old");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [google],
      primaryEmailAddressId: googleEmail.id,
    });
    vi.mocked(user.update).mockImplementation(async ({ primaryEmailAddressId }) => {
      user.primaryEmailAddressId = primaryEmailAddressId ?? null;
      throw new Error("response lost");
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    let completed: boolean | undefined;
    await act(async () => {
      completed = await result.current.setPassword("safe-password");
    });

    expect(completed).toBe(true);
    expect(user.update).toHaveBeenCalledOnce();
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(user.updatePassword).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({
      phase: "methodReady",
      targetEmailAddressId: targetEmail.id,
      feedback: { status: "success" },
    });
    expect(google.destroy).not.toHaveBeenCalled();
  });

  it("targetをPrimaryにできなければパスワードを設定せず完了扱いにしない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
    });
    vi.mocked(user.update).mockRejectedValue(new Error("primary update failed"));
    const { result } = renderHook(() =>
      useEmailPasswordMigrationController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification: vi.fn(),
        runOperation: async (operation) => operation(),
      }),
    );

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    let completed: boolean | undefined;
    await act(async () => {
      completed = await result.current.setPassword("safe-password");
    });

    expect(completed).toBe(false);
    expect(user.primaryEmailAddressId).toBe(googleEmail.id);
    expect(user.updatePassword).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      phase: "settingPassword",
      feedback: { status: "error" },
    });
  });

  it("パスワード設定後にPrimaryがtargetから変われば完了扱いにしない", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
    });
    vi.mocked(user.updatePassword).mockImplementation(async () => {
      user.passwordEnabled = true;
      user.primaryEmailAddressId = googleEmail.id;
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    let completed: boolean | undefined;
    await act(async () => {
      completed = await result.current.setPassword("safe-password");
    });

    expect(completed).toBe(false);
    expect(result.current.state).toMatchObject({
      phase: "settingPassword",
      feedback: { status: "error" },
    });
  });

  it("パスワード設定を連打してもPrimary更新とパスワード設定を一度だけ開始する", async () => {
    const googleEmail = emailResource("google-email", "google@gmail.com", "verified", true);
    const targetEmail = emailResource("email-target", "login@example.com", "verified");
    const user = userResource({
      emailAddresses: [googleEmail, targetEmail],
      externalAccounts: [googleResource("google-old")],
      primaryEmailAddressId: googleEmail.id,
    });
    const gate = deferred<void>();
    vi.mocked(user.update).mockImplementation(async ({ primaryEmailAddressId }) => {
      await gate.promise;
      user.primaryEmailAddressId = primaryEmailAddressId ?? null;
      return user;
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

    await act(async () => result.current.useDifferentEmail(targetEmail.emailAddress));
    let first = Promise.resolve<boolean | undefined>(undefined);
    let second = Promise.resolve<boolean | undefined>(undefined);
    act(() => {
      first = result.current.setPassword("safe-password");
      second = result.current.setPassword("safe-password");
    });
    gate.resolve();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBeUndefined();
    expect(user.update).toHaveBeenCalledOnce();
    expect(user.updatePassword).toHaveBeenCalledOnce();
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

    await act(async () => result.current.useDifferentEmail(linkedEmail.emailAddress));

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
    expect(runOperation).toHaveBeenCalledWith(expect.any(Function), {
      preferredFirstFactorStrategy: "email_code",
    });
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
      message: "このメールアドレスに変更できません。\n別のメールアドレスを入力してください。",
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
    update: vi.fn(async ({ primaryEmailAddressId }: { primaryEmailAddressId?: string | null }) => {
      if (primaryEmailAddressId !== undefined) user.primaryEmailAddressId = primaryEmailAddressId;
      return user;
    }),
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

function isGoogleLink(link: { type: string }) {
  return link.type === "oauth_google";
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
