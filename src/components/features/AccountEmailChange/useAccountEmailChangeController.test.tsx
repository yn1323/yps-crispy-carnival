// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useUser: vi.fn(),
  preflight: vi.fn(),
  syncPrimary: vi.fn(),
  isReverificationCancelledError: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useUser: mocks.useUser,
  useReverification: (operation: (...args: unknown[]) => Promise<unknown>) => operation,
}));

vi.mock("@clerk/react/errors", () => ({
  isReverificationCancelledError: mocks.isReverificationCancelledError,
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.preflight,
  useAction: () => mocks.syncPrimary,
}));

import { accountEmailChangeSessionAtom, accountEmailCleanupSessionAtom } from "@/src/stores/accountEmail";
import { useAccountEmailChangeController } from "./useAccountEmailChangeController";

describe("useAccountEmailChangeController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preflight.mockResolvedValue({ status: "ready" });
    mocks.syncPrimary.mockResolvedValue({ status: "synced", changed: true });
    mocks.isReverificationCancelledError.mockReturnValue(false);
    getDefaultStore().set(accountEmailChangeSessionAtom, null);
    getDefaultStore().set(accountEmailCleanupSessionAtom, null);
    sessionStorage.clear();
  });

  it("新メールをverifyしてprimary化・Convex同期した後にだけ旧メールを削除する", async () => {
    const fixture = clerkFixture();
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    const { result } = renderHook(() => useAccountEmailChangeController());

    await act(async () => {
      await result.current.start("new@example.com");
    });

    expect(result.current.step).toBe("verify");
    expect(fixture.user.update).not.toHaveBeenCalled();
    expect(mocks.syncPrimary).not.toHaveBeenCalled();
    expect(fixture.oldEmail.destroy).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.verify("123456");
    });

    await waitFor(() => expect(result.current.step).toBe("complete"));
    expect(fixture.target.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(fixture.user.update).toHaveBeenCalledWith({ primaryEmailAddressId: fixture.target.id });
    expect(mocks.syncPrimary).toHaveBeenCalledTimes(1);
    expect(fixture.oldEmail.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.events.indexOf("sync")).toBeLessThan(fixture.events.indexOf("destroy-old"));
    expect(getDefaultStore().get(accountEmailChangeSessionAtom)).toEqual({
      clerkUserId: "user_account_email",
      source: "app",
    });

    act(() => result.current.reset());
    expect(getDefaultStore().get(accountEmailChangeSessionAtom)).toBeNull();
  });

  it("primary変更後に同期が失敗しても旧メールを削除せず、再試行後に削除する", async () => {
    const fixture = clerkFixture();
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    mocks.syncPrimary.mockImplementation(async () => {
      fixture.events.push("sync");
      return mocks.syncPrimary.mock.calls.length === 1
        ? { status: "unavailable", retryable: true }
        : { status: "synced", changed: true };
    });
    const { result } = renderHook(() => useAccountEmailChangeController());

    await act(async () => {
      await result.current.start("new@example.com");
      await result.current.verify("123456");
    });

    await waitFor(() => expect(result.current.step).toBe("syncFailed"));
    expect(fixture.oldEmail.destroy).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retrySync();
    });

    await waitFor(() => expect(result.current.step).toBe("complete"));
    expect(mocks.syncPrimary).toHaveBeenCalledTimes(2);
    expect(fixture.oldEmail.destroy).toHaveBeenCalledTimes(1);
  });

  it("旧メール削除後に応答だけ失われてもreloadしたClerk resourceから完了を判定する", async () => {
    const fixture = clerkFixture();
    fixture.oldEmail.destroy.mockImplementationOnce(async () => {
      fixture.events.push("destroy-old");
      fixture.user.emailAddresses = [fixture.target as never];
      throw new Error("response lost");
    });
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    const { result } = renderHook(() => useAccountEmailChangeController());

    await act(async () => {
      await result.current.start("new@example.com");
      await result.current.verify("123456");
    });

    await waitFor(() => expect(result.current.step).toBe("complete"));
    expect(fixture.oldEmail.destroy).toHaveBeenCalledTimes(1);
  });

  it("再読み込み後も未完了の旧メール削除を復元して再試行できる", async () => {
    const fixture = clerkFixture();
    fixture.user.primaryEmailAddressId = fixture.target.id;
    fixture.user.primaryEmailAddress = fixture.target as never;
    fixture.target.verification.status = "verified";
    fixture.user.emailAddresses = [fixture.oldEmail as never, fixture.target as never];
    getDefaultStore().set(accountEmailCleanupSessionAtom, {
      clerkUserId: fixture.user.id,
      kind: "oldPrimary",
      emailAddressId: fixture.oldEmail.id,
      primaryEmailAddressId: fixture.target.id,
    });
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });

    const { result } = renderHook(() => useAccountEmailChangeController({ resumeCleanup: true }));

    await waitFor(() => expect(result.current.step).toBe("cleanupFailed"));
    expect(fixture.oldEmail.destroy).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retryCleanup();
    });

    await waitFor(() => expect(result.current.step).toBe("complete"));
    expect(fixture.oldEmail.destroy).toHaveBeenCalledTimes(1);
    expect(getDefaultStore().get(accountEmailCleanupSessionAtom)).toBeNull();
  });

  it("同期失敗後のrollbackは旧メールをprimaryへ戻してから追加メールを削除する", async () => {
    const fixture = clerkFixture();
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    mocks.syncPrimary.mockResolvedValueOnce({ status: "conflict" }).mockImplementationOnce(async () => {
      fixture.events.push("sync-old");
      return { status: "synced", changed: true };
    });
    const { result } = renderHook(() => useAccountEmailChangeController());

    await act(async () => {
      await result.current.start("new@example.com");
      await result.current.verify("123456");
    });
    await waitFor(() => expect(result.current.step).toBe("syncFailed"));

    await act(async () => {
      await result.current.rollback();
    });

    await waitFor(() => expect(result.current.step).toBe("rolledBack"));
    expect(fixture.user.update).toHaveBeenNthCalledWith(2, { primaryEmailAddressId: fixture.oldEmail.id });
    expect(mocks.syncPrimary).toHaveBeenCalledTimes(2);
    expect(fixture.target.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.oldEmail.destroy).not.toHaveBeenCalled();
    expect(fixture.events.indexOf("primary-old")).toBeLessThan(fixture.events.indexOf("sync-old"));
    expect(fixture.events.indexOf("sync-old")).toBeLessThan(fixture.events.indexOf("destroy-target"));
    expect(fixture.events.indexOf("primary-old")).toBeLessThan(fixture.events.indexOf("destroy-target"));
  });

  it("rollback後のConvex再同期に失敗した場合は追加メールを残して再試行できる", async () => {
    const fixture = clerkFixture();
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    mocks.syncPrimary.mockResolvedValueOnce({ status: "conflict" }).mockResolvedValueOnce({ status: "unavailable" });
    const { result } = renderHook(() => useAccountEmailChangeController());

    await act(async () => {
      await result.current.start("new@example.com");
      await result.current.verify("123456");
    });
    await waitFor(() => expect(result.current.step).toBe("syncFailed"));

    await act(async () => {
      await result.current.rollback();
    });

    await waitFor(() => expect(result.current.step).toBe("rollbackSyncFailed"));
    expect(fixture.target.destroy).not.toHaveBeenCalled();

    mocks.syncPrimary.mockResolvedValueOnce({ status: "synced", changed: true });
    await act(async () => {
      await result.current.retryRollbackSync();
    });

    await waitFor(() => expect(result.current.step).toBe("rolledBack"));
    expect(fixture.target.destroy).toHaveBeenCalledTimes(1);
  });

  it("reverificationをキャンセルした場合は同期も削除も行わず確認画面へ戻る", async () => {
    const cancellation = new Error("cancelled");
    const fixture = clerkFixture({ updateError: cancellation });
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    mocks.isReverificationCancelledError.mockImplementation((error) => error === cancellation);
    const { result } = renderHook(() => useAccountEmailChangeController());

    await act(async () => {
      await result.current.start("new@example.com");
      await result.current.verify("123456");
    });

    await waitFor(() => expect(result.current.step).toBe("verify"));
    expect(mocks.syncPrimary).not.toHaveBeenCalled();
    expect(fixture.oldEmail.destroy).not.toHaveBeenCalled();
  });

  it("二重submitでもpreflightと確認コード送信を一回だけ実行する", async () => {
    let releasePreflight: (() => void) | undefined;
    mocks.preflight.mockImplementation(
      async () =>
        await new Promise<{ status: "ready" }>((resolve) => {
          releasePreflight = () => resolve({ status: "ready" });
        }),
    );
    const fixture = clerkFixture();
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    const { result } = renderHook(() => useAccountEmailChangeController());

    let first: Promise<unknown>;
    await act(async () => {
      first = result.current.start("new@example.com");
      await result.current.start("new@example.com");
    });
    expect(mocks.preflight).toHaveBeenCalledTimes(1);

    await act(async () => {
      releasePreflight?.();
      await first;
    });

    expect(fixture.target.prepareVerification).toHaveBeenCalledTimes(1);
  });

  it("preflightの業務エラーを認証エラーへ置き換えず表示する", async () => {
    const fixture = clerkFixture();
    mocks.useUser.mockReturnValue({ isLoaded: true, user: fixture.user });
    mocks.preflight.mockRejectedValue({ data: "このメールアドレスは別のユーザーが使用しています。" });
    const { result } = renderHook(() => useAccountEmailChangeController());

    await act(async () => {
      await result.current.start("new@example.com");
    });

    expect(result.current.step).toBe("input");
    expect(result.current.errorMessage).toBe("このメールアドレスは別のユーザーが使用しています。");
  });
});

function clerkFixture(options: { updateError?: unknown } = {}) {
  const events: string[] = [];
  const oldEmail = {
    id: "idn_old",
    emailAddress: "old@example.com",
    verification: { status: "verified" },
    destroy: vi.fn(async () => {
      events.push("destroy-old");
      return oldEmail;
    }),
  };
  const target = {
    id: "idn_new",
    emailAddress: "new@example.com",
    verification: { status: "unverified" },
    prepareVerification: vi.fn(async () => target),
    attemptVerification: vi.fn(async () => {
      target.verification.status = "verified";
      return target;
    }),
    destroy: vi.fn(async () => {
      events.push("destroy-target");
      return target;
    }),
  };
  const user = {
    id: "user_account_email",
    primaryEmailAddressId: oldEmail.id,
    primaryEmailAddress: oldEmail,
    emailAddresses: [oldEmail],
    createEmailAddress: vi.fn(async () => {
      user.emailAddresses.push(target as never);
      return target;
    }),
    update: vi.fn(async ({ primaryEmailAddressId }: { primaryEmailAddressId: string }) => {
      if (options.updateError) throw options.updateError;
      if (primaryEmailAddressId === target.id) {
        events.push("primary-new");
        user.primaryEmailAddressId = target.id;
        user.primaryEmailAddress = target as never;
      } else {
        events.push("primary-old");
        user.primaryEmailAddressId = oldEmail.id;
        user.primaryEmailAddress = oldEmail;
      }
      return user;
    }),
    reload: vi.fn(async () => user),
  };
  mocks.syncPrimary.mockImplementation(async () => {
    events.push("sync");
    return { status: "synced", changed: true };
  });
  return { events, oldEmail, target, user };
}
