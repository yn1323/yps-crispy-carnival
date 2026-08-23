// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Staff } from "../types";

const mocks = vi.hoisted(() => ({
  generateLineLinkToken: vi.fn(),
  sendLineInvite: vi.fn(),
  createToast: vi.fn(),
  shopMutationCallCount: 0,
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const mutations = [mocks.generateLineLinkToken, mocks.sendLineInvite];
    const mutation = mutations[mocks.shopMutationCallCount % mutations.length];
    mocks.shopMutationCallCount += 1;
    return mutation;
  },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/components/ui/toaster", () => ({
  toaster: { create: mocks.createToast },
}));

import { useStaffLineConnection } from "./useStaffLineConnection";

const staff = {
  _id: "staff-target",
  name: "対象スタッフ",
  email: "staff@example.com",
} as Staff;

beforeEach(() => {
  mocks.generateLineLinkToken.mockReset();
  mocks.sendLineInvite.mockReset();
  mocks.createToast.mockReset();
  mocks.shopMutationCallCount = 0;
});

describe("useStaffLineConnection", () => {
  it("閲覧専用へ切り替わるとQR表示を消し、LINE操作を開始しない", async () => {
    mocks.generateLineLinkToken.mockResolvedValue({ authorizeUrl: "https://example.com/line" });
    const { result, rerender } = renderHook(({ isReadOnly }) => useStaffLineConnection(isReadOnly), {
      initialProps: { isReadOnly: false },
    });

    await act(async () => {
      await result.current.onShowQr(staff);
    });
    expect(result.current.qrState.authorizeUrl).toBe("https://example.com/line");

    rerender({ isReadOnly: true });
    expect(result.current.qrState.authorizeUrl).toBeNull();

    mocks.generateLineLinkToken.mockClear();
    await act(async () => {
      await result.current.onShowQr(staff);
      await result.current.onSendInvite(staff);
    });
    expect(mocks.generateLineLinkToken).not.toHaveBeenCalled();
    expect(mocks.sendLineInvite).not.toHaveBeenCalled();
  });

  it("QR発行中に閲覧専用へ切り替わった場合は、完了後のURLを表示しない", async () => {
    let resolveToken: ((value: { authorizeUrl: string }) => void) | undefined;
    mocks.generateLineLinkToken.mockImplementation(
      () =>
        new Promise<{ authorizeUrl: string }>((resolve) => {
          resolveToken = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ isReadOnly }) => useStaffLineConnection(isReadOnly), {
      initialProps: { isReadOnly: false },
    });

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.onShowQr(staff);
    });
    rerender({ isReadOnly: true });

    await act(async () => {
      resolveToken?.({ authorizeUrl: "https://example.com/line" });
      await pending;
    });

    expect(result.current.qrState.authorizeUrl).toBeNull();
  });

  it("案内メールの送信直前にクールダウンへ入った場合は送信済みと案内する", async () => {
    mocks.sendLineInvite.mockResolvedValue({ scheduled: false, reason: "recentlySent" });
    const { result } = renderHook(() => useStaffLineConnection());

    await act(async () => {
      await result.current.onSendInvite(staff);
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "送信済みです",
      description: "送信から10分後に再送できるようになります。",
      type: "info",
    });
  });

  it("案内メールの日次上限に達した場合は時間をおいた再送を案内する", async () => {
    mocks.sendLineInvite.mockResolvedValue({ scheduled: false, reason: "rateLimited" });
    const { result } = renderHook(() => useStaffLineConnection());

    await act(async () => {
      await result.current.onSendInvite(staff);
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "少し時間をおいて再送してください",
      type: "error",
    });
  });
});
