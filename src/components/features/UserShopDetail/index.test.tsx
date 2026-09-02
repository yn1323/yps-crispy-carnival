// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  useNotificationActions: vi.fn(),
  useMembershipActions: vi.fn(),
  historyProps: undefined as
    | undefined
    | {
        shopId: string;
        staffId: string;
        enabled: boolean;
        lineConnectionStatus: "linked" | "unlinked";
        expectedOrganizationId: string;
      },
}));

vi.mock("@/src/components/features/StaffNotificationHistory", () => ({
  StaffNotificationHistory: (props: {
    shopId: string;
    staffId: string;
    enabled: boolean;
    lineConnectionStatus: "linked" | "unlinked";
    expectedOrganizationId: string;
  }) => {
    mocks.historyProps = props;
    return <output data-testid="history-shop">{props.shopId}</output>;
  },
}));

vi.mock("./UserShopDetailView", () => ({
  UserShopDetailView: ({
    isStoreReadOnly,
    membership,
    notificationHistory,
    actions,
  }: {
    isStoreReadOnly: boolean;
    membership: UserShopDetailMembership;
    notificationHistory: ReactNode;
    actions: { onBack: () => void };
  }) => (
    <div>
      <output data-testid="read-only">{String(isStoreReadOnly)}</output>
      <output data-testid="excluded-from-shift">{String(membership.excludedFromShift)}</output>
      {notificationHistory}
      <button type="button" onClick={actions.onBack}>
        戻る
      </button>
    </div>
  ),
}));

vi.mock("./useUserShopNotificationActions", () => ({
  useUserShopNotificationActions: mocks.useNotificationActions,
}));

vi.mock("./useUserShopMembershipActions", () => ({
  useUserShopMembershipActions: mocks.useMembershipActions,
}));

import { UserShopDetail } from ".";

const targetShopId = "shop-target" as Id<"shops">;
const organizationId = "organization-a" as Id<"organizations">;
const membership = {
  staffId: "staff-target" as Id<"staffs">,
  shopId: targetShopId,
  shopName: "対象店舗",
} as unknown as UserShopDetailMembership;
const data = {
  person: { id: "person-target", name: "田中 花子" },
  canWrite: true,
  line: { status: "unlinked" },
} as unknown as UserShopDetailData;

beforeEach(() => {
  mocks.useNotificationActions.mockReset();
  mocks.useMembershipActions.mockReset();
  mocks.historyProps = undefined;
  mocks.useNotificationActions.mockReturnValue({
    openRecruitments: [],
    currentRecruitments: [],
    isLoading: false,
    sendRecruitments: vi.fn(),
    sendCurrentShift: vi.fn(),
    isSendingRecruitments: false,
    isSendingCurrentShift: false,
  });
  mocks.useMembershipActions.mockReturnValue({
    excludedFromShift: membership.excludedFromShift,
    isChangingShiftTarget: false,
    onChangeShiftTarget: vi.fn(),
  });
});

describe("UserShopDetail", () => {
  it("店舗別controllerと通知履歴へpathのtargetShopIdを渡す", () => {
    render(
      <UserShopDetail
        data={data}
        membership={membership}
        targetShopId={targetShopId}
        expectedOrganizationId={organizationId}
        onBack={vi.fn()}
      />,
    );

    expect(mocks.useNotificationActions).toHaveBeenCalledWith({
      targetShopId,
      membership,
      isReadOnly: false,
      enabled: true,
      expectedOrganizationId: organizationId,
    });
    expect(mocks.useMembershipActions).toHaveBeenCalledWith({
      targetShopId,
      membership,
      isReadOnly: false,
      expectedOrganizationId: organizationId,
    });
    expect(mocks.historyProps).toEqual({
      shopId: targetShopId,
      staffId: membership.staffId,
      enabled: true,
      lineConnectionStatus: "unlinked",
      expectedOrganizationId: organizationId,
    });
    expect(screen.getByTestId("history-shop").textContent).toBe("shop-target");
  });

  it("組織の更新が制限されている場合は閲覧専用として全controllerへ渡す", () => {
    const readOnlyData = { ...data, canWrite: false } as UserShopDetailData;
    render(
      <UserShopDetail
        data={readOnlyData}
        membership={membership}
        targetShopId={targetShopId}
        expectedOrganizationId={organizationId}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("read-only").textContent).toBe("true");
    expect(mocks.useNotificationActions).toHaveBeenCalledWith({
      targetShopId,
      membership,
      isReadOnly: true,
      enabled: true,
      expectedOrganizationId: organizationId,
    });
  });

  it("シフト対象設定の楽観値を画面全体へ反映する", () => {
    mocks.useMembershipActions.mockReturnValue({
      excludedFromShift: true,
      isChangingShiftTarget: true,
      onChangeShiftTarget: vi.fn(),
    });

    render(
      <UserShopDetail
        data={data}
        membership={membership}
        targetShopId={targetShopId}
        expectedOrganizationId={organizationId}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("excluded-from-shift").textContent).toBe("true");
  });
});
