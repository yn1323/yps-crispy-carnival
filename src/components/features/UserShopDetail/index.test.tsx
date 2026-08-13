// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  useNotificationActions: vi.fn(),
  useMembershipActions: vi.fn(),
  historyProps: undefined as undefined | { shopId: string; staffId: string; enabled: boolean },
  notificationSectionActive: true,
  notificationSectionRef: vi.fn(),
  activateNotificationSection: vi.fn(),
}));

vi.mock("@/src/hooks/useViewportActivation", () => ({
  useViewportActivation: () => ({
    ref: mocks.notificationSectionRef,
    isActive: mocks.notificationSectionActive,
    activate: mocks.activateNotificationSection,
  }),
}));

vi.mock("@/src/components/features/StaffNotificationHistory", () => ({
  StaffNotificationHistory: (props: { shopId: string; staffId: string; enabled: boolean }) => {
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
const membership = {
  staffId: "staff-target" as Id<"staffs">,
  shopId: targetShopId,
  shopName: "対象店舗",
  shopStatus: "active",
} as unknown as UserShopDetailMembership;
const data = {
  person: { id: "person-target", name: "田中 花子" },
  canWrite: true,
} as unknown as UserShopDetailData;

beforeEach(() => {
  mocks.useNotificationActions.mockReset();
  mocks.useMembershipActions.mockReset();
  mocks.historyProps = undefined;
  mocks.notificationSectionActive = true;
  mocks.notificationSectionRef.mockReset();
  mocks.activateNotificationSection.mockReset();
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
    render(<UserShopDetail data={data} membership={membership} targetShopId={targetShopId} onBack={vi.fn()} />);

    expect(mocks.useNotificationActions).toHaveBeenCalledWith({
      targetShopId,
      membership,
      isReadOnly: false,
      enabled: true,
    });
    expect(mocks.useMembershipActions).toHaveBeenCalledWith({
      targetShopId,
      membership,
      isReadOnly: false,
    });
    expect(mocks.historyProps).toEqual({ shopId: targetShopId, staffId: membership.staffId, enabled: true });
    expect(screen.getByTestId("history-shop").textContent).toBe("shop-target");
  });

  it("通知sectionがviewport外の間は通知queryと履歴を開始しない", () => {
    mocks.notificationSectionActive = false;

    render(<UserShopDetail data={data} membership={membership} targetShopId={targetShopId} onBack={vi.fn()} />);

    expect(mocks.useNotificationActions).toHaveBeenCalledWith({
      targetShopId,
      membership,
      isReadOnly: false,
      enabled: false,
    });
    expect(mocks.historyProps).toBeUndefined();
    expect(screen.queryByTestId("history-shop")).toBeNull();
  });

  it("停止中店舗は閲覧専用として全controllerへ渡す", () => {
    const archivedMembership = { ...membership, shopStatus: "archived" } as UserShopDetailMembership;
    render(<UserShopDetail data={data} membership={archivedMembership} targetShopId={targetShopId} onBack={vi.fn()} />);

    expect(screen.getByTestId("read-only").textContent).toBe("true");
    expect(mocks.useNotificationActions).toHaveBeenCalledWith({
      targetShopId,
      membership: archivedMembership,
      isReadOnly: true,
      enabled: true,
    });
  });

  it("シフト対象設定の楽観値を画面全体へ反映する", () => {
    mocks.useMembershipActions.mockReturnValue({
      excludedFromShift: true,
      isChangingShiftTarget: true,
      onChangeShiftTarget: vi.fn(),
    });

    render(<UserShopDetail data={data} membership={membership} targetShopId={targetShopId} onBack={vi.fn()} />);

    expect(screen.getByTestId("excluded-from-shift").textContent).toBe("true");
  });
});
