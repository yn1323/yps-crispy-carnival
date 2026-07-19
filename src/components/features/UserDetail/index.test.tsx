// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/src/components/features/StaffNotificationHistory", () => ({
  StaffNotificationHistory: () => null,
}));

vi.mock("./UserDetailView", () => ({
  UserDetailView: ({ activeTab, actions }: { activeTab: string; actions: { onTabChange: (tab: "line") => void } }) => (
    <div>
      <output data-testid="active-tab">{activeTab}</output>
      <button type="button" onClick={() => actions.onTabChange("line")}>
        LINE連携
      </button>
    </div>
  ),
}));

vi.mock("./useUserProfileUpdate", () => ({
  useUserProfileUpdate: () => ({ isUpdating: false, update: vi.fn() }),
}));

vi.mock("./useUserNotificationActions", () => ({
  useUserNotificationActions: () => ({
    openRecruitments: [],
    currentRecruitments: [],
    isLoading: false,
    isSendingRecruitments: false,
    isSendingCurrentShift: false,
    sendRecruitments: vi.fn(),
    sendCurrentShift: vi.fn(),
  }),
}));

vi.mock("./useUserLineActions", () => ({
  useUserLineActions: () => ({
    authorizeUrl: null,
    showQr: false,
    isQrLoading: false,
    isSendingInvite: false,
    onShowQr: vi.fn(),
    onSendInvite: vi.fn(),
  }),
}));

vi.mock("./useUserMembershipActions", () => ({
  useUserMembershipActions: () => ({
    dialog: null,
    isChangingShiftTarget: false,
    isRemovingMembership: false,
    isAddingMembership: false,
    onChangeShiftTarget: vi.fn(),
    onAddMembership: vi.fn(),
    onRequestRemoveMembership: vi.fn(),
    onConfirmRemoveMembership: vi.fn(),
    onCloseDialog: vi.fn(),
  }),
}));

vi.mock("./useUserManagerActions", () => ({
  useUserManagerActions: () => ({
    dialog: null,
    isAssignmentConfirmationOpen: false,
    isAssigningManager: false,
    isRemoving: false,
    onRequestManagerAssignment: vi.fn(),
    onCancelManagerAssignment: vi.fn(),
    onAssignManager: vi.fn(),
    onRequestRemoveManagerRole: vi.fn(),
    onRequestRemovePerson: vi.fn(),
    onConfirmRemoval: vi.fn(),
    onCloseDialog: vi.fn(),
  }),
}));

import { UserDetail } from ".";

const data = {
  person: { id: "person-1", name: "田中 花子", email: "hanako@example.com" },
  isSelf: false,
  canWrite: true,
  shops: [],
  memberships: [],
} as unknown as UserDetailData;

beforeEach(() => {
  mocks.navigate.mockReset();
});

describe("UserDetail", () => {
  it("タブを手元で切り替え、スクロール位置を保ったままURLへ同期する", async () => {
    const { rerender } = render(
      <UserDetail
        data={data}
        selectedShopId={null}
        activeTab="notification"
        returnTo="dashboard"
        visibleUserCount={10}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "LINE連携" }));

    expect(screen.getByTestId("active-tab").textContent).toBe("line");
    expect(mocks.navigate).toHaveBeenCalledOnce();
    const navigation = mocks.navigate.mock.calls[0]?.[0];
    expect(navigation).toMatchObject({ to: ".", replace: true, resetScroll: false });
    expect(navigation.search({ shop: "shop-a", tab: "notification", returnTo: "dashboard" })).toEqual({
      shop: "shop-a",
      tab: "line",
      returnTo: "dashboard",
    });

    rerender(
      <UserDetail data={data} selectedShopId={null} activeTab="settings" returnTo="dashboard" visibleUserCount={10} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("active-tab").textContent).toBe("settings");
    });
  });
});
