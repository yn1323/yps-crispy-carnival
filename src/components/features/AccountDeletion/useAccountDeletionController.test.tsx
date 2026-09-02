// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { submitAccountDeletionRequest } from "./submitAccountDeletionRequest";

const mocks = vi.hoisted(() => ({
  selectedShopAtom: Symbol("selectedShopAtom"),
  userAtom: Symbol("userAtom"),
  emptyUser: { authId: "", name: "", email: "" },
  getToken: vi.fn(),
  signOut: vi.fn(),
  setSelectedShop: vi.fn(),
  setUser: vi.fn(),
  runWithReverification: vi.fn(),
  isReverificationCancelledError: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
  useClerk: () => ({ signOut: mocks.signOut }),
  useReverification:
    (fetcher: (...args: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) =>
      mocks.runWithReverification(fetcher, args),
}));

vi.mock("@clerk/react/errors", () => ({
  isReverificationCancelledError: mocks.isReverificationCancelledError,
}));

vi.mock("jotai", () => ({
  useSetAtom: (targetAtom: unknown) => {
    if (targetAtom === mocks.userAtom) return mocks.setUser;
    if (targetAtom === mocks.selectedShopAtom) return mocks.setSelectedShop;
    throw new Error("Unexpected atom");
  },
}));

vi.mock("@/src/stores/shop", () => ({
  selectedShopAtom: mocks.selectedShopAtom,
}));

vi.mock("@/src/stores/user", () => ({
  EMPTY_USER: mocks.emptyUser,
  userAtom: mocks.userAtom,
}));

import { useAccountDeletionController } from "./useAccountDeletionController";

beforeEach(() => {
  mocks.getToken.mockReset();
  mocks.signOut.mockReset();
  mocks.setSelectedShop.mockReset();
  mocks.setUser.mockReset();
  mocks.runWithReverification.mockReset();
  mocks.isReverificationCancelledError.mockReset();

  mocks.getToken.mockResolvedValue("fresh-token");
  mocks.signOut.mockResolvedValue(undefined);
  mocks.isReverificationCancelledError.mockReturnValue(false);
  mocks.runWithReverification.mockImplementation(
    async (fetcher: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => fetcher(...args),
  );
});

describe("useAccountDeletionController", () => {
  it("所属を含む削除ではdialogを開いた時点のpreviewを明示payloadへ固定する", async () => {
    const submitRequest = vi.fn<typeof submitAccountDeletionRequest>().mockResolvedValue({
      status: "rejected",
      reason: "networkError",
    });
    const preview = {
      status: "ready",
      action: "leaveOrganization",
      previewFingerprint: "preview-1",
      organization: { name: "テスト組織", shopCount: 2 },
      futureAssignmentCount: 3,
    } as const;
    const { result } = renderHook(() =>
      useAccountDeletionController({
        submitRequest,
        createRequestId: () => "request-1",
        replaceLocation: vi.fn(),
        currentPreview: preview,
        requiresPreview: true,
      }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(submitRequest).toHaveBeenCalledOnce());
    expect(submitRequest).toHaveBeenCalledWith({
      requestId: "request-1",
      token: "fresh-token",
      scope: "accountAndAssociations",
      previewFingerprint: "preview-1",
    });
    expect(result.current.preview).toEqual(preview);
  });

  it("dialogを開いた後にpreviewが変わった場合は送信せず、最新内容の再確認を求める", async () => {
    const submitRequest = vi.fn<typeof submitAccountDeletionRequest>();
    const firstPreview = {
      status: "ready",
      action: "leaveOrganization",
      previewFingerprint: "preview-1",
      organization: { name: "テスト組織", shopCount: 1 },
      futureAssignmentCount: 0,
    } as const;
    const nextPreview = {
      status: "ready",
      action: "deleteOrganization",
      previewFingerprint: "preview-2",
      organization: { name: "テスト組織", shopCount: 1 },
    } as const;
    const { result, rerender } = renderHook(
      ({ currentPreview }) =>
        useAccountDeletionController({
          submitRequest,
          createRequestId: () => "request-1",
          replaceLocation: vi.fn(),
          currentPreview,
          requiresPreview: true,
        }),
      { initialProps: { currentPreview: firstPreview as typeof firstPreview | typeof nextPreview } },
    );

    act(() => result.current.open());
    rerender({ currentPreview: nextPreview });
    expect(result.current.isPreviewStale).toBe(true);

    act(() => result.current.onSubmit());

    expect(submitRequest).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({
      message: "所属情報が更新されたため、アカウントを削除できません。\n画面を更新して、最新の内容をご確認ください。",
      showContactLink: false,
    });
    expect(result.current.preview).toEqual(firstPreview);
  });

  it("previewがblockedの間は削除dialogを開かない", () => {
    const createRequestId = vi.fn(() => "request-1");
    const { result } = renderHook(() =>
      useAccountDeletionController({
        createRequestId,
        currentPreview: { status: "blocked", reason: "multipleOrganizations" },
        requiresPreview: true,
      }),
    );

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(false);
    expect(createRequestId).not.toHaveBeenCalled();
  });

  it("同じdialogの再試行ではrequest IDを固定し、閉じて開き直した場合だけ更新する", async () => {
    const submitRequest = vi.fn<typeof submitAccountDeletionRequest>().mockResolvedValue({
      status: "rejected",
      reason: "networkError",
    });
    const createRequestId = vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("request-2");
    const { result } = renderHook(() =>
      useAccountDeletionController({ submitRequest, createRequestId, replaceLocation: vi.fn() }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());
    await waitFor(() => expect(submitRequest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isRunning).toBe(false));

    act(() => result.current.onSubmit());
    await waitFor(() => expect(submitRequest).toHaveBeenCalledTimes(2));
    expect(submitRequest.mock.calls[0]?.[0].requestId).toBe("request-1");
    expect(submitRequest.mock.calls[1]?.[0].requestId).toBe("request-1");

    act(() => result.current.onClose());
    act(() => result.current.open());
    act(() => result.current.onSubmit());
    await waitFor(() => expect(submitRequest).toHaveBeenCalledTimes(3));
    expect(submitRequest.mock.calls[2]?.[0].requestId).toBe("request-2");
    expect(createRequestId).toHaveBeenCalledTimes(2);
  });

  it("連続submitでもHTTP要求を一度だけ実行する", async () => {
    let resolveRequest: ((value: { status: "rejected"; reason: "networkError" }) => void) | undefined;
    const submitRequest = vi.fn<typeof submitAccountDeletionRequest>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useAccountDeletionController({ submitRequest, createRequestId: () => "request-1", replaceLocation: vi.fn() }),
    );

    act(() => result.current.open());
    act(() => {
      result.current.onSubmit();
      result.current.onSubmit();
    });

    await waitFor(() => expect(submitRequest).toHaveBeenCalledOnce());
    await act(async () => resolveRequest?.({ status: "rejected", reason: "networkError" }));
    await waitFor(() => expect(result.current.isRunning).toBe(false));
  });

  it("Clerk本人確認後の自動再送ではfresh tokenを取り直す", async () => {
    mocks.getToken.mockReset();
    mocks.getToken
      .mockResolvedValueOnce("token-before-reverification")
      .mockResolvedValueOnce("token-after-reverification");
    mocks.runWithReverification.mockImplementation(
      async (fetcher: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        const first = await fetcher(...args);
        if (isReverificationHint(first)) return fetcher(...args);
        return first;
      },
    );
    const submitRequest = vi
      .fn<typeof submitAccountDeletionRequest>()
      .mockResolvedValueOnce({
        clerk_error: {
          type: "forbidden",
          reason: "reverification-error",
          metadata: { reverification: { level: "strict" } },
        },
      })
      .mockResolvedValueOnce({ status: "accepted" });
    const replaceLocation = vi.fn();
    const { result } = renderHook(() =>
      useAccountDeletionController({ submitRequest, createRequestId: () => "request-1", replaceLocation }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(replaceLocation).toHaveBeenCalledWith("/account-deletion-accepted"));
    expect(mocks.getToken).toHaveBeenCalledTimes(2);
    expect(mocks.getToken).toHaveBeenNthCalledWith(1, { skipCache: true });
    expect(mocks.getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(submitRequest).toHaveBeenNthCalledWith(1, { requestId: "request-1", token: "token-before-reverification" });
    expect(submitRequest).toHaveBeenNthCalledWith(2, { requestId: "request-1", token: "token-after-reverification" });
  });

  it("再認証がnullで終了した場合は成功にも一般errorにも進めない", async () => {
    mocks.runWithReverification.mockResolvedValue(null);
    const replaceLocation = vi.fn();
    const submitRequest = vi.fn<typeof submitAccountDeletionRequest>();
    const { result } = renderHook(() =>
      useAccountDeletionController({ submitRequest, createRequestId: () => "request-1", replaceLocation }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.isOpen).toBe(true);
    expect(mocks.setUser).not.toHaveBeenCalled();
    expect(mocks.setSelectedShop).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(replaceLocation).not.toHaveBeenCalled();
  });

  it("Clerkの再認証キャンセルerrorは一般errorを表示しない", async () => {
    const cancellation = new Error("cancelled");
    mocks.runWithReverification.mockRejectedValue(cancellation);
    mocks.isReverificationCancelledError.mockImplementation((error) => error === cancellation);
    const replaceLocation = vi.fn();
    const { result } = renderHook(() =>
      useAccountDeletionController({
        submitRequest: vi.fn<typeof submitAccountDeletionRequest>(),
        createRequestId: () => "request-1",
        replaceLocation,
      }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.isOpen).toBe(true);
    expect(replaceLocation).not.toHaveBeenCalled();
  });

  it("本人確認factorを利用できないなどの一般SDK errorでは問い合わせ導線を表示する", async () => {
    mocks.runWithReverification.mockRejectedValue(new Error("no supported reverification factor"));
    const { result } = renderHook(() =>
      useAccountDeletionController({
        submitRequest: vi.fn<typeof submitAccountDeletionRequest>(),
        createRequestId: () => "request-1",
        replaceLocation: vi.fn(),
      }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.error).toEqual({
      message: "アカウントの削除を受け付けられませんでした。\n時間をおいて、もう一度お試しください。",
      showContactLink: true,
    });
    expect(result.current.isOpen).toBe(true);
  });

  it.each([
    [
      "associationChanged",
      "所属情報が更新されたため、アカウントを削除できません。\n画面を更新して、最新の内容をご確認ください。",
    ],
    ["rateLimited", "操作回数が多すぎます。\n時間をおいて、もう一度お試しください。"],
  ] as const)("既知の%s errorでは問い合わせ導線を表示しない", async (reason, message) => {
    const submitRequest = vi
      .fn<typeof submitAccountDeletionRequest>()
      .mockResolvedValue({ status: "rejected", reason });
    const { result } = renderHook(() =>
      useAccountDeletionController({ submitRequest, createRequestId: () => "request-1", replaceLocation: vi.fn() }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.error).toEqual({ message, showContactLink: false });
  });

  it("処理中はcloseとopen state変更を受け付けない", async () => {
    let resolveRequest: ((value: { status: "rejected"; reason: "networkError" }) => void) | undefined;
    const submitRequest = vi.fn<typeof submitAccountDeletionRequest>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useAccountDeletionController({ submitRequest, createRequestId: () => "request-1", replaceLocation: vi.fn() }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());
    act(() => {
      result.current.onClose();
      result.current.onOpenChange({ open: false });
    });

    expect(result.current.isOpen).toBe(true);
    await waitFor(() => expect(submitRequest).toHaveBeenCalledOnce());
    await act(async () => resolveRequest?.({ status: "rejected", reason: "networkError" }));
    await waitFor(() => expect(result.current.isRunning).toBe(false));
    act(() => result.current.onClose());
    expect(result.current.isOpen).toBe(false);
  });

  it("202後はatomを破棄し、sign-outが失敗しても公開完了画面へ移る", async () => {
    mocks.signOut.mockRejectedValue(new Error("sign-out failed"));
    const submitRequest = vi.fn<typeof submitAccountDeletionRequest>().mockResolvedValue({ status: "accepted" });
    const replaceLocation = vi.fn();
    const { result } = renderHook(() =>
      useAccountDeletionController({ submitRequest, createRequestId: () => "request-1", replaceLocation }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(replaceLocation).toHaveBeenCalledWith("/account-deletion-accepted"));
    expect(mocks.setUser).toHaveBeenCalledWith(mocks.emptyUser);
    expect(mocks.setSelectedShop).toHaveBeenCalledWith(null);
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: "/account-deletion-accepted" });
    expect(mocks.setUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.setSelectedShop.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(replaceLocation.mock.invocationCallOrder[0] ?? 0);
  });

  it("再認証hintがSDKから残って返っても受付成功として扱わない", async () => {
    mocks.runWithReverification.mockResolvedValue({
      clerk_error: { type: "forbidden", reason: "reverification-error" },
    });
    const replaceLocation = vi.fn();
    const { result } = renderHook(() =>
      useAccountDeletionController({
        submitRequest: vi.fn<typeof submitAccountDeletionRequest>(),
        createRequestId: () => "request-1",
        replaceLocation,
      }),
    );

    act(() => result.current.open());
    act(() => result.current.onSubmit());

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.error).toEqual({
      message: "アカウントの削除を受け付けられませんでした。\n時間をおいて、もう一度お試しください。",
      showContactLink: true,
    });
    expect(mocks.setUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(replaceLocation).not.toHaveBeenCalled();
  });
});

function isReverificationHint(value: unknown): value is { clerk_error: unknown } {
  return typeof value === "object" && value !== null && "clerk_error" in value;
}
