// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  recruitmentsRef: Symbol("recruitments"),
  currentRecruitmentsRef: Symbol("currentRecruitments"),
  cooldownsRef: Symbol("cooldowns"),
  sendOpenRef: Symbol("sendOpenRecruitments"),
  sendCurrentRef: Symbol("sendCurrentShift"),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  sendOpen: vi.fn(),
  sendCurrent: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  createToast: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: {
      queries: {
        getDashboardRecruitments: mocks.recruitmentsRef,
        getDashboardCurrentRecruitments: mocks.currentRecruitmentsRef,
      },
    },
    staff: {
      queries: {
        getNotificationResendCooldowns: mocks.cooldownsRef,
      },
      mutations: {
        sendOpenRecruitmentNotifications: mocks.sendOpenRef,
        sendCurrentShiftNotification: mocks.sendCurrentRef,
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/components/ui/toaster", () => ({ toaster: { create: mocks.createToast } }));

import { useUserShopNotificationActions } from "./useUserShopNotificationActions";

const targetShopId = "shop-target" as Id<"shops">;
const staffId = "staff-target" as Id<"staffs">;
const membership = {
  shopId: targetShopId,
  staffId,
} as unknown as UserShopDetailMembership;
const openRecruitment = { _id: "recruitment-open", status: "open" };
const closedRecruitment = { _id: "recruitment-closed", status: "confirmed" };
const currentRecruitment = { _id: "recruitment-current", status: "confirmed" };

beforeEach(() => {
  mocks.usePaginatedQuery.mockReset();
  mocks.useQuery.mockReset();
  mocks.useMutation.mockReset();
  mocks.sendOpen.mockReset();
  mocks.sendCurrent.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.createToast.mockReset();
  mocks.usePaginatedQuery.mockReturnValue({
    results: [openRecruitment, closedRecruitment],
    status: "Exhausted",
  });
  mocks.useQuery.mockImplementation((reference: unknown) => {
    if (reference === mocks.currentRecruitmentsRef) return [currentRecruitment];
    if (reference === mocks.cooldownsRef) {
      return { openRecruitmentsUntil: null, currentShiftUntil: null, lineInviteUntil: null };
    }
    throw new Error("Unexpected query reference");
  });
  mocks.useMutation.mockImplementation((reference: unknown) => {
    if (reference === mocks.sendOpenRef) return mocks.sendOpen;
    if (reference === mocks.sendCurrentRef) return mocks.sendCurrent;
    throw new Error("Unexpected mutation reference");
  });
  mocks.sendOpen.mockResolvedValue({ scheduled: true });
  mocks.sendCurrent.mockResolvedValue({ scheduled: true });
});

describe("useUserShopNotificationActions", () => {
  it("募集・確定シフトのqueryと通知mutationへpathのtargetShopIdを明示する", async () => {
    const { result } = renderHook(() =>
      useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false, enabled: true }),
    );

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      mocks.recruitmentsRef,
      { shopId: targetShopId },
      { initialNumItems: 100 },
    );
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.currentRecruitmentsRef, { shopId: targetShopId });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.cooldownsRef, {
      shopId: targetShopId,
      staffId,
    });
    expect(result.current.openRecruitments).toEqual([openRecruitment]);
    expect(result.current.currentRecruitments).toEqual([currentRecruitment]);

    await act(async () => {
      await result.current.sendRecruitments();
    });
    await act(async () => {
      await result.current.sendCurrentShift();
    });

    expect(mocks.sendOpen).toHaveBeenCalledExactlyOnceWith({ shopId: targetShopId, staffId });
    expect(mocks.sendCurrent).toHaveBeenCalledExactlyOnceWith({ shopId: targetShopId, staffId });
    expect(mocks.showSuccessToast.mock.calls).toEqual([
      [{ title: "シフト募集通知を再送しました" }],
      [{ title: "確定シフト通知を再送しました" }],
    ]);
  });

  it("membershipとpathの店舗が一致しなければ通知mutationを送らない", async () => {
    const mismatchedShopId = "shop-other" as Id<"shops">;
    const { result } = renderHook(() =>
      useUserShopNotificationActions({
        targetShopId: mismatchedShopId,
        membership,
        isReadOnly: false,
        enabled: true,
      }),
    );

    await act(async () => {
      await result.current.sendRecruitments();
      await result.current.sendCurrentShift();
    });

    expect(mocks.sendOpen).not.toHaveBeenCalled();
    expect(mocks.sendCurrent).not.toHaveBeenCalled();
  });

  it("確定シフトが再送上限を超えた場合は処理を始めず理由を案内する", async () => {
    mocks.sendCurrent.mockResolvedValue({ scheduled: false, reason: "tooManyCurrentShifts" });
    const { result } = renderHook(() =>
      useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false, enabled: true }),
    );

    await act(async () => {
      await result.current.sendCurrentShift();
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "確定シフトが40件を超えるため、一度に再送できません",
      type: "error",
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("未確定の変更がある場合は確定後の再送を案内する", async () => {
    mocks.sendCurrent.mockResolvedValue({ scheduled: false, reason: "unconfirmedChanges" });
    const { result } = renderHook(() =>
      useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false, enabled: true }),
    );

    await act(async () => {
      await result.current.sendCurrentShift();
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "未確定の変更があるため、シフトを確定してから再送してください",
      type: "error",
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("クールダウン中の種別だけをブラウザから再送しない", async () => {
    mocks.useQuery.mockImplementation((reference: unknown) => {
      if (reference === mocks.currentRecruitmentsRef) return [currentRecruitment];
      if (reference === mocks.cooldownsRef) {
        return {
          openRecruitmentsUntil: Date.now() + 60_000,
          currentShiftUntil: null,
          lineInviteUntil: null,
        };
      }
      throw new Error("Unexpected query reference");
    });
    const { result } = renderHook(() =>
      useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false, enabled: true }),
    );

    await act(async () => {
      await result.current.sendRecruitments();
      await result.current.sendCurrentShift();
    });

    expect(result.current.isRecruitmentCooldownActive).toBe(true);
    expect(result.current.isCurrentShiftCooldownActive).toBe(false);
    expect(mocks.sendOpen).not.toHaveBeenCalled();
    expect(mocks.sendCurrent).toHaveBeenCalledExactlyOnceWith({ shopId: targetShopId, staffId });
  });

  it("クールダウン取得中は2種類とも再送しない", async () => {
    mocks.useQuery.mockImplementation((reference: unknown) => {
      if (reference === mocks.currentRecruitmentsRef) return [currentRecruitment];
      if (reference === mocks.cooldownsRef) return undefined;
      throw new Error("Unexpected query reference");
    });
    const { result } = renderHook(() =>
      useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false, enabled: true }),
    );

    await act(async () => {
      await result.current.sendRecruitments();
      await result.current.sendCurrentShift();
    });

    expect(result.current.isCooldownLoading).toBe(true);
    expect(mocks.sendOpen).not.toHaveBeenCalled();
    expect(mocks.sendCurrent).not.toHaveBeenCalled();
  });

  it("送信直前の競合でrecentlySentになった場合は成功扱いしない", async () => {
    mocks.sendOpen.mockResolvedValue({ scheduled: false, reason: "recentlySent" });
    const { result } = renderHook(() =>
      useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false, enabled: true }),
    );

    await act(async () => {
      await result.current.sendRecruitments();
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "送信済みです",
      description: "送信から10分後に再送できるようになります。",
      type: "info",
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("非表示中はqueryをskipし、再表示時だけ購読を開始する", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false, enabled }),
      { initialProps: { enabled: false } },
    );

    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(mocks.recruitmentsRef, "skip", {
      initialNumItems: 100,
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.currentRecruitmentsRef, "skip");
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.cooldownsRef, "skip");
    expect(result.current.openRecruitments).toEqual([]);
    expect(result.current.currentRecruitments).toEqual([]);

    rerender({ enabled: true });
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(
      mocks.recruitmentsRef,
      { shopId: targetShopId },
      { initialNumItems: 100 },
    );
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.currentRecruitmentsRef, { shopId: targetShopId });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.cooldownsRef, {
      shopId: targetShopId,
      staffId,
    });

    rerender({ enabled: false });
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(mocks.recruitmentsRef, "skip", {
      initialNumItems: 100,
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.currentRecruitmentsRef, "skip");
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.cooldownsRef, "skip");
  });
});
