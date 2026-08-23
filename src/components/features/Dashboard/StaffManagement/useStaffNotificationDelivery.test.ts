// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Staff } from "../types";

const mocks = vi.hoisted(() => ({
  sendOpenRecruitmentNotifications: vi.fn(),
  sendCurrentShiftNotification: vi.fn(),
  createToast: vi.fn(),
  shopMutationCallCount: 0,
}));

vi.mock("@/src/hooks/useShopMutation", () => ({
  useShopMutation: () => {
    const mutations = [mocks.sendOpenRecruitmentNotifications, mocks.sendCurrentShiftNotification];
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

import { useStaffNotificationDelivery } from "./useStaffNotificationDelivery";

const staff = {
  _id: "staff-target",
  name: "対象スタッフ",
  email: "staff@example.com",
} as Staff;

beforeEach(() => {
  mocks.sendOpenRecruitmentNotifications.mockReset();
  mocks.sendCurrentShiftNotification.mockReset();
  mocks.createToast.mockReset();
  mocks.shopMutationCallCount = 0;
});

describe("useStaffNotificationDelivery", () => {
  it("閲覧専用ではスタッフへの通知送信を開始しない", async () => {
    const { result } = renderHook(() => useStaffNotificationDelivery(true));

    await act(async () => {
      await result.current.onSendRecruitments(staff);
      await result.current.onSendCurrentShift(staff);
    });

    expect(mocks.sendOpenRecruitmentNotifications).not.toHaveBeenCalled();
    expect(mocks.sendCurrentShiftNotification).not.toHaveBeenCalled();
  });

  it("確定シフトが再送上限を超えた場合は処理を始めず理由を案内する", async () => {
    mocks.sendCurrentShiftNotification.mockResolvedValue({
      scheduled: false,
      reason: "tooManyCurrentShifts",
    });
    const { result } = renderHook(() => useStaffNotificationDelivery());

    await act(async () => {
      await result.current.onSendCurrentShift(staff);
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "確定シフトが40件を超えるため、一度に再送できません。",
      type: "error",
    });
  });

  it("未確定の変更がある場合は確定後の再送を案内する", async () => {
    mocks.sendCurrentShiftNotification.mockResolvedValue({
      scheduled: false,
      reason: "unconfirmedChanges",
    });
    const { result } = renderHook(() => useStaffNotificationDelivery());

    await act(async () => {
      await result.current.onSendCurrentShift(staff);
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "未確定の変更があります。\nシフトを確定してから再送してください。",
      type: "error",
    });
  });

  it("募集中シフトの送信直前にクールダウンへ入った場合は送信済みと案内する", async () => {
    mocks.sendOpenRecruitmentNotifications.mockResolvedValue({
      scheduled: false,
      reason: "recentlySent",
    });
    const { result } = renderHook(() => useStaffNotificationDelivery());

    await act(async () => {
      await result.current.onSendRecruitments(staff);
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "送信済みです",
      description: "送信から10分後に再送できるようになります。",
      type: "info",
    });
  });

  it("確定シフトの送信直前にクールダウンへ入った場合は送信済みと案内する", async () => {
    mocks.sendCurrentShiftNotification.mockResolvedValue({
      scheduled: false,
      reason: "recentlySent",
    });
    const { result } = renderHook(() => useStaffNotificationDelivery());

    await act(async () => {
      await result.current.onSendCurrentShift(staff);
    });

    expect(mocks.createToast).toHaveBeenCalledExactlyOnceWith({
      title: "送信済みです",
      description: "送信から10分後に再送できるようになります。",
      type: "info",
    });
  });
});
