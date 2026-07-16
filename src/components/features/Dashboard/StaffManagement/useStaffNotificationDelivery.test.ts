// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Staff } from "../types";

const mocks = vi.hoisted(() => ({
  sendOpenRecruitmentNotifications: vi.fn(),
  sendCurrentShiftNotification: vi.fn(),
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
  toaster: { create: vi.fn() },
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
});
