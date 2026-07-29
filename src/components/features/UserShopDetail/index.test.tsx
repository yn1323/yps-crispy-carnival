// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";

const mocks = vi.hoisted(() => ({
  featureVisibilityAtom: Symbol("featureVisibilityAtom"),
  featureVisibility: { shopMembershipAddition: true },
  useLineActions: vi.fn(),
  useNotificationActions: vi.fn(),
  useMembershipActions: vi.fn(),
  confirmRemoveMembership: vi.fn(),
  historyProps: undefined as undefined | { shopId: string; staffId: string; enabled: boolean },
}));

vi.mock("jotai", () => ({
  useAtomValue: (target: unknown) => {
    if (target === mocks.featureVisibilityAtom) return mocks.featureVisibility;
    throw new Error("Unexpected atom");
  },
}));

vi.mock("@/src/stores/user", () => ({ featureVisibilityAtom: mocks.featureVisibilityAtom }));

vi.mock("@/src/components/features/StaffNotificationHistory", () => ({
  StaffNotificationHistory: (props: { shopId: string; staffId: string; enabled: boolean }) => {
    mocks.historyProps = props;
    return <output data-testid="history-shop">{props.shopId}</output>;
  },
}));

vi.mock("./UserShopDetailView", () => ({
  UserShopDetailView: ({
    isStoreReadOnly,
    notificationHistory,
    actions,
  }: {
    isStoreReadOnly: boolean;
    notificationHistory: ReactNode;
    actions: { onBack: () => void; onConfirmRemoveMembership: () => void };
  }) => (
    <div>
      <output data-testid="read-only">{String(isStoreReadOnly)}</output>
      {notificationHistory}
      <button type="button" onClick={actions.onBack}>
        戻る
      </button>
      <button type="button" onClick={actions.onConfirmRemoveMembership}>
        削除を確定する
      </button>
    </div>
  ),
}));

vi.mock("./useUserShopLineActions", () => ({
  useUserShopLineActions: mocks.useLineActions,
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
  mocks.useLineActions.mockReset();
  mocks.useNotificationActions.mockReset();
  mocks.useMembershipActions.mockReset();
  mocks.confirmRemoveMembership.mockReset();
  mocks.confirmRemoveMembership.mockResolvedValue(true);
  mocks.historyProps = undefined;
  mocks.featureVisibility.shopMembershipAddition = true;
  mocks.useLineActions.mockReturnValue({
    authorizeUrl: null,
    showQr: false,
    isQrLoading: false,
    isSendingInvite: false,
    onShowQr: vi.fn(),
    onSendInvite: vi.fn(),
  });
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
    dialog: { kind: "removeMembership" },
    isChangingShiftTarget: false,
    isRemovingMembership: false,
    onChangeShiftTarget: vi.fn(),
    onRequestRemoveMembership: vi.fn(),
    onConfirmRemoveMembership: mocks.confirmRemoveMembership,
    onCloseDialog: vi.fn(),
  });
});

describe("UserShopDetail", () => {
  it("全controllerと通知履歴へpathのtargetShopIdを渡す", () => {
    render(
      <UserShopDetail
        data={data}
        membership={membership}
        targetShopId={targetShopId}
        onBack={vi.fn()}
        onMembershipRemoved={vi.fn()}
      />,
    );

    expect(mocks.useLineActions).toHaveBeenCalledWith({ targetShopId, membership, isReadOnly: false });
    expect(mocks.useNotificationActions).toHaveBeenCalledWith({ targetShopId, membership, isReadOnly: false });
    expect(mocks.useMembershipActions).toHaveBeenCalledWith({
      targetShopId,
      membership,
      isReadOnly: false,
      canRemoveMembership: true,
    });
    expect(mocks.historyProps).toEqual({ shopId: targetShopId, staffId: membership.staffId, enabled: true });
    expect(screen.getByTestId("history-shop").textContent).toBe("shop-target");
  });

  it("店舗所属の削除成功後にユーザー詳細への復帰callbackを呼ぶ", async () => {
    const onMembershipRemoved = vi.fn();
    render(
      <UserShopDetail
        data={data}
        membership={membership}
        targetShopId={targetShopId}
        onBack={vi.fn()}
        onMembershipRemoved={onMembershipRemoved}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "削除を確定する" }));
    });

    expect(mocks.confirmRemoveMembership).toHaveBeenCalledOnce();
    expect(onMembershipRemoved).toHaveBeenCalledOnce();
  });

  it("停止中店舗は閲覧専用として全controllerへ渡す", () => {
    const archivedMembership = { ...membership, shopStatus: "archived" } as UserShopDetailMembership;
    render(
      <UserShopDetail
        data={data}
        membership={archivedMembership}
        targetShopId={targetShopId}
        onBack={vi.fn()}
        onMembershipRemoved={vi.fn()}
      />,
    );

    expect(screen.getByTestId("read-only").textContent).toBe("true");
    expect(mocks.useLineActions).toHaveBeenCalledWith({
      targetShopId,
      membership: archivedMembership,
      isReadOnly: true,
    });
  });
});
