// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  recruitmentsRef: Symbol("recruitments"),
  currentRecruitmentsRef: Symbol("currentRecruitments"),
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
  mocks.useQuery.mockReturnValue([currentRecruitment]);
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
      useUserShopNotificationActions({ targetShopId, membership, isReadOnly: false }),
    );

    expect(mocks.usePaginatedQuery).toHaveBeenCalledWith(
      mocks.recruitmentsRef,
      { shopId: targetShopId },
      { initialNumItems: 100 },
    );
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.currentRecruitmentsRef, { shopId: targetShopId });
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
      [{ title: "シフト募集通知を送りました" }],
      [{ title: "現在の確定シフトを送りました" }],
    ]);
  });

  it("membershipとpathの店舗が一致しなければ通知mutationを送らない", async () => {
    const mismatchedShopId = "shop-other" as Id<"shops">;
    const { result } = renderHook(() =>
      useUserShopNotificationActions({ targetShopId: mismatchedShopId, membership, isReadOnly: false }),
    );

    await act(async () => {
      await result.current.sendRecruitments();
      await result.current.sendCurrentShift();
    });

    expect(mocks.sendOpen).not.toHaveBeenCalled();
    expect(mocks.sendCurrent).not.toHaveBeenCalled();
  });
});
