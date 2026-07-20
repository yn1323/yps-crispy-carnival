// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDetailData, UserDetailPanel } from "./types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addMembership: vi.fn(),
  confirmRemoveMembership: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/src/components/features/StaffNotificationHistory", () => ({
  StaffNotificationHistory: () => null,
}));

vi.mock("./UserDetailView", () => ({
  UserDetailView: ({
    activePanel,
    actions,
  }: {
    activePanel?: UserDetailPanel;
    actions: {
      onBack: () => void;
      onOpenBasic: () => void;
      onOpenAddShop: () => void;
      onOpenShop: (shopId: string) => void;
      onClosePanel: () => void;
      onAddMembership: (shopId: string) => void;
      onConfirmRemoveMembership: () => void;
    };
  }) => (
    <div>
      <output data-testid="active-panel">{activePanel ?? "closed"}</output>
      <button type="button" onClick={actions.onBack}>
        戻る
      </button>
      <button type="button" onClick={actions.onOpenBasic}>
        基本情報を開く
      </button>
      <button type="button" onClick={actions.onOpenAddShop}>
        店舗追加を開く
      </button>
      <button type="button" onClick={() => actions.onOpenShop("shop-b")}>
        店舗詳細を開く
      </button>
      <button type="button" onClick={actions.onClosePanel}>
        閉じる
      </button>
      <button type="button" onClick={() => actions.onAddMembership("shop-c")}>
        店舗に追加する
      </button>
      <button type="button" onClick={actions.onConfirmRemoveMembership}>
        店舗から外す
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
    onReset: vi.fn(),
  }),
}));

vi.mock("./useUserMembershipActions", () => ({
  useUserMembershipActions: () => ({
    dialog: null,
    isChangingShiftTarget: false,
    isRemovingMembership: false,
    isAddingMembership: false,
    addingShopId: null,
    onChangeShiftTarget: vi.fn(),
    onAddMembership: mocks.addMembership,
    onRequestRemoveMembership: vi.fn(),
    onConfirmRemoveMembership: mocks.confirmRemoveMembership,
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
  mocks.addMembership.mockReset();
  mocks.addMembership.mockResolvedValue(false);
  mocks.confirmRemoveMembership.mockReset();
  mocks.confirmRemoveMembership.mockResolvedValue(false);
});

describe("UserDetail", () => {
  it("基本情報と店舗追加のパネルをURL検索条件で開く", () => {
    render(<UserDetail data={data} selectedShopId={null} returnTo="dashboard" visibleUserCount={10} />);

    fireEvent.click(screen.getByRole("button", { name: "基本情報を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "店舗追加を開く" }));

    const openBasicNavigation = mocks.navigate.mock.calls[0]?.[0];
    expect(openBasicNavigation).toMatchObject({ to: ".", replace: true, resetScroll: false });
    expect(openBasicNavigation.search({ shop: "shop-a", returnTo: "dashboard" })).toEqual({
      shop: "shop-a",
      panel: "basic",
      returnTo: "dashboard",
    });

    const openAddShopNavigation = mocks.navigate.mock.calls[1]?.[0];
    expect(openAddShopNavigation).toMatchObject({ to: ".", replace: true, resetScroll: false });
    expect(openAddShopNavigation.search({ shop: "shop-a", returnTo: "dashboard" })).toEqual({
      shop: "shop-a",
      panel: "addShop",
      returnTo: "dashboard",
    });
  });

  it("所属店舗を押すと店舗とshopパネルを同時にURLへ反映し、閉じるとpanelだけを解除する", () => {
    const { rerender } = render(
      <UserDetail data={data} selectedShopId={null} activePanel="basic" returnTo="dashboard" visibleUserCount={10} />,
    );

    expect(screen.getByTestId("active-panel").textContent).toBe("basic");
    fireEvent.click(screen.getByRole("button", { name: "店舗詳細を開く" }));

    const openShopNavigation = mocks.navigate.mock.calls[0]?.[0];
    expect(openShopNavigation).toMatchObject({ to: ".", replace: true, resetScroll: false });
    expect(openShopNavigation.search({ shop: "shop-a", panel: "basic", returnTo: "dashboard" })).toEqual({
      shop: "shop-b",
      panel: "shop",
      returnTo: "dashboard",
    });

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    const closePanelNavigation = mocks.navigate.mock.calls[1]?.[0];
    expect(closePanelNavigation).toMatchObject({ to: ".", replace: true, resetScroll: false });
    expect(closePanelNavigation.search({ shop: "shop-b", panel: "shop", returnTo: "dashboard" })).toEqual({
      shop: "shop-b",
      panel: undefined,
      returnTo: "dashboard",
    });

    rerender(
      <UserDetail data={data} selectedShopId="shop-b" activePanel="shop" returnTo="dashboard" visibleUserCount={10} />,
    );
    expect(screen.getByTestId("active-panel").textContent).toBe("shop");
  });

  it("戻る操作では一覧の復元条件を維持する", () => {
    render(
      <UserDetail data={data} selectedShopId="shop-b" activePanel="basic" returnTo="settings" visibleUserCount={30} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/settings",
      search: { shop: "shop-b", users: 30, focus: "person-1" },
      replace: true,
    });
  });

  it("店舗追加の完了前に別パネルへ移った場合は、そのパネルを閉じない", async () => {
    let resolveAddition: ((value: boolean) => void) | undefined;
    const addition = new Promise<boolean>((resolve) => {
      resolveAddition = resolve;
    });
    mocks.addMembership.mockReturnValue(addition);
    const { rerender } = render(
      <UserDetail
        data={data}
        selectedShopId="shop-a"
        activePanel="addShop"
        returnTo="dashboard"
        visibleUserCount={10}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "店舗に追加する" }));
    rerender(
      <UserDetail data={data} selectedShopId="shop-a" activePanel="basic" returnTo="dashboard" visibleUserCount={10} />,
    );
    await act(async () => {
      resolveAddition?.(true);
      await addition;
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("店舗所属解除の完了前に別パネルへ移った場合は、そのパネルを閉じない", async () => {
    let resolveRemoval: ((value: boolean) => void) | undefined;
    const removal = new Promise<boolean>((resolve) => {
      resolveRemoval = resolve;
    });
    mocks.confirmRemoveMembership.mockReturnValue(removal);
    const { rerender } = render(
      <UserDetail data={data} selectedShopId="shop-a" activePanel="shop" returnTo="dashboard" visibleUserCount={10} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "店舗から外す" }));
    rerender(
      <UserDetail data={data} selectedShopId="shop-a" activePanel="basic" returnTo="dashboard" visibleUserCount={10} />,
    );
    await act(async () => {
      resolveRemoval?.(true);
      await removal;
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
