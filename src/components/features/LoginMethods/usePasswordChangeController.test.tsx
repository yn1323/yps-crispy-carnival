// @vitest-environment jsdom

import type { EmailAddressResource, UserResource } from "@clerk/shared/types";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isReverificationCancelledError: vi.fn(),
  reverificationOptions: [] as unknown[],
  showSuccessToast: vi.fn(),
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

vi.mock("@/src/components/shared/feedback", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

import type { LoginMethodOperationRunner } from "./migrationTypes";
import type { LoginMethodOperationOptions } from "./reverificationTypes";
import { usePasswordChangeController } from "./usePasswordChangeController";

beforeEach(() => {
  mocks.isReverificationCancelledError.mockReset();
  mocks.isReverificationCancelledError.mockReturnValue(false);
  mocks.reverificationOptions.length = 0;
  mocks.showSuccessToast.mockReset();
});

describe("パスワード変更controller", () => {
  it("current Userのパスワードを変更し、ほかの端末をログアウトする", async () => {
    const user = userResource();
    const operationOptions: Array<LoginMethodOperationOptions | undefined> = [];
    const runOperation: LoginMethodOperationRunner = async (operation, options) => {
      operationOptions.push(options);
      return operation();
    };
    const onNeedsReverification = vi.fn();
    const { result } = renderHook(() =>
      usePasswordChangeController({
        isLoaded: true,
        user,
        getCurrentActorId: () => user.id,
        onNeedsReverification,
        runOperation,
      }),
    );

    act(() => result.current.open());
    await act(async () =>
      result.current.changePassword({
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmation: "new-password",
      }),
    );

    expect(user.reload).toHaveBeenCalledOnce();
    expect(user.updatePassword).toHaveBeenCalledWith({
      currentPassword: "current-password",
      newPassword: "new-password",
      signOutOfOtherSessions: true,
    });
    expect(operationOptions).toEqual([{ preferredFirstFactorStrategy: "password" }]);
    expect(mocks.reverificationOptions.length).toBeGreaterThan(0);
    for (const options of mocks.reverificationOptions) {
      expect(options).toEqual({ onNeedsReverification });
    }
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({ title: "パスワードを変更しました" });
    expect(result.current.state).toEqual({ isOpen: false, status: "idle", message: null });
  });

  it("reload中にcurrent Userが切り替われば別Userへパスワードを設定しない", async () => {
    const user = userResource();
    let currentActorId = user.id;
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      currentActorId = "user-switched";
      return user;
    });
    const { result } = renderPasswordController(user, () => currentActorId);

    act(() => result.current.open());
    await act(async () =>
      result.current.changePassword({
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmation: "new-password",
      }),
    );

    expect(user.updatePassword).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({
      isOpen: true,
      status: "error",
      message: "パスワードを変更できませんでした。\n入力内容を確認して、もう一度お試しください。",
    });
  });

  it("変更確定の連打はsingle-flightでClerk更新を1回に抑える", async () => {
    const user = userResource();
    const gate = deferred<UserResource>();
    vi.mocked(user.updatePassword).mockReturnValueOnce(gate.promise);
    const { result } = renderPasswordController(user);
    const values = {
      currentPassword: "current-password",
      newPassword: "new-password",
      confirmation: "new-password",
    };

    act(() => result.current.open());
    let first!: Promise<boolean | undefined>;
    let second!: Promise<boolean | undefined>;
    await act(async () => {
      first = result.current.changePassword(values);
      second = result.current.changePassword(values);
      await Promise.resolve();
    });

    expect(user.updatePassword).toHaveBeenCalledOnce();
    await act(async () => gate.resolve(user));
    await act(async () => Promise.all([first, second]));
    expect(user.updatePassword).toHaveBeenCalledOnce();
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
  });

  it("現在のパスワード誤りは生のClerkエラーを表示せず再入力できる", async () => {
    const user = userResource();
    vi.mocked(user.updatePassword).mockRejectedValueOnce({
      errors: [{ code: "form_password_incorrect", longMessage: "The supplied password was incorrect" }],
    });
    const { result } = renderPasswordController(user);

    act(() => result.current.open());
    await act(async () =>
      result.current.changePassword({
        currentPassword: "wrong-password",
        newPassword: "new-password",
        confirmation: "new-password",
      }),
    );

    expect(user.updatePassword).toHaveBeenCalledOnce();
    expect(result.current.state).toEqual({
      isOpen: true,
      status: "error",
      message: "現在のパスワードが正しくありません。\n入力内容を確認してください。",
    });
    expect(result.current.state.message).not.toContain("supplied");
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("本人再確認をキャンセルした場合は成功扱いにせず入力画面へ戻す", async () => {
    const cancellation = new Error("cancelled");
    const user = userResource();
    vi.mocked(user.updatePassword).mockRejectedValueOnce(cancellation);
    mocks.isReverificationCancelledError.mockImplementation((error) => error === cancellation);
    const { result } = renderPasswordController(user);

    act(() => result.current.open());
    await act(async () =>
      result.current.changePassword({
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmation: "new-password",
      }),
    );

    expect(result.current.state).toEqual({ isOpen: true, status: "idle", message: null });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("本人再確認中に閉じたModalをキャンセル完了後に開き直さない", async () => {
    const cancellation = new Error("cancelled");
    const user = userResource();
    const gate = deferred<UserResource>();
    vi.mocked(user.updatePassword).mockReturnValueOnce(gate.promise);
    mocks.isReverificationCancelledError.mockImplementation((error) => error === cancellation);
    const { result } = renderPasswordController(user);

    act(() => result.current.open());
    let request!: Promise<boolean | undefined>;
    await act(async () => {
      request = result.current.changePassword({
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmation: "new-password",
      });
      await Promise.resolve();
    });

    act(() => result.current.close(true));
    await act(async () => gate.reject(cancellation));
    await act(async () => request);

    expect(result.current.state).toEqual({ isOpen: false, status: "idle", message: null });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("Googleのみではパスワード変更Modalを開かない", () => {
    const user = userResource({ passwordEnabled: false });
    const { result } = renderPasswordController(user);

    act(() => result.current.open());

    expect(result.current.state).toEqual({ isOpen: false, status: "idle", message: null });
    expect(user.updatePassword).not.toHaveBeenCalled();
  });
});

function renderPasswordController(user: UserResource, getCurrentActorId = () => user.id) {
  return renderHook(() =>
    usePasswordChangeController({
      isLoaded: true,
      user,
      getCurrentActorId,
      onNeedsReverification: vi.fn(),
      runOperation: async (operation) => operation(),
    }),
  );
}

function userResource({ passwordEnabled = true }: { passwordEnabled?: boolean } = {}) {
  const emailAddress = {
    id: "email-primary",
    emailAddress: "login@example.com",
    verification: { status: "verified" },
    linkedTo: [],
  } as unknown as EmailAddressResource;
  const user = {
    id: "user-current",
    passwordEnabled,
    primaryEmailAddressId: emailAddress.id,
    emailAddresses: [emailAddress],
    externalAccounts: [],
    reload: vi.fn(async () => user),
    updatePassword: vi.fn(async () => user),
  };
  return user as unknown as UserResource;
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
