// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDetailData, UserDetailPanel, UserMembershipChangeInput } from "./types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  changeMemberships: vi.fn(),
  updateProfile: vi.fn(),
  featureVisibilityAtom: Symbol("featureVisibilityAtom"),
  featureVisibility: {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: true,
  },
  managerOptions: undefined as undefined | { onPersonRemoved: (personId: string) => void },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("jotai", () => ({
  useAtomValue: (target: unknown) => {
    if (target === mocks.featureVisibilityAtom) return mocks.featureVisibility;
    throw new Error("Unexpected atom");
  },
}));

vi.mock("@/src/stores/user", () => ({
  featureVisibilityAtom: mocks.featureVisibilityAtom,
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
      onUpdateProfile: (data: { name: string; email: string }) => void | Promise<void>;
      onChangeMemberships: (input: UserMembershipChangeInput) => void;
    };
  }) => (
    <div>
      <output data-testid="active-panel">{activePanel ?? "closed"}</output>
      <button type="button" onClick={actions.onBack}>
        戻る
      </button>
      <button type="button" onClick={actions.onOpenBasic}>
        スタッフ情報を開く
      </button>
      <button type="button" onClick={actions.onOpenAddShop}>
        店舗追加を開く
      </button>
      <button type="button" onClick={() => actions.onOpenShop("shop-b")}>
        店舗別設定を開く
      </button>
      <button type="button" onClick={actions.onClosePanel}>
        閉じる
      </button>
      <button type="button" onClick={() => actions.onUpdateProfile({ name: "更新後", email: "updated@example.com" })}>
        スタッフ情報を保存
      </button>
      <button type="button" onClick={() => actions.onChangeMemberships(membershipChangeInput)}>
        所属店舗を変更する
      </button>
    </div>
  ),
}));

vi.mock("./useUserProfileUpdate", () => ({
  useUserProfileUpdate: () => ({ isUpdating: false, update: mocks.updateProfile }),
}));

vi.mock("./useUserMembershipActions", () => ({
  useUserMembershipActions: () => ({
    isChangingMemberships: false,
    onChangeMemberships: mocks.changeMemberships,
  }),
}));

vi.mock("./useUserManagerActions", () => ({
  useUserManagerActions: (options: { onPersonRemoved: (personId: string) => void }) => {
    mocks.managerOptions = options;
    return {
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
    };
  },
}));

import { UserDetail } from ".";

const data = {
  person: { id: "person-1", name: "田中 花子", email: "hanako@example.com" },
  isSelf: false,
  canWrite: true,
  shops: [],
  memberships: [],
} as unknown as UserDetailData;

const membershipChangeInput = {
  shopId: "shop-c",
  desiredActiveShopIds: ["shop-c"],
  expectedMembershipFingerprint: "membership-fingerprint",
  removalPreviews: [],
  requestId: "change-request",
} as unknown as UserMembershipChangeInput;

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.changeMemberships.mockReset();
  mocks.updateProfile.mockReset();
  mocks.changeMemberships.mockResolvedValue(false);
  mocks.updateProfile.mockResolvedValue(false);
  mocks.featureVisibility.shopMembershipAddition = true;
  mocks.managerOptions = undefined;
});

describe("UserDetail", () => {
  it("スタッフ情報の更新が成功したら編集モーダルを閉じる", async () => {
    mocks.updateProfile.mockResolvedValue(true);
    render(
      <UserDetail data={data} selectedShopId="shop-a" activePanel="basic" returnTo="dashboard" visibleUserCount={10} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を保存" }));
    });

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const closeNavigation = mocks.navigate.mock.calls[0]?.[0];
    expect(closeNavigation).toMatchObject({ to: ".", replace: true, resetScroll: false });
    expect(closeNavigation.search({ shop: "shop-a", panel: "basic", returnTo: "dashboard" })).toEqual({
      shop: "shop-a",
      panel: undefined,
      returnTo: "dashboard",
    });
  });

  it("スタッフ情報の更新に失敗したら編集モーダルを閉じない", async () => {
    mocks.updateProfile.mockResolvedValue(false);
    render(
      <UserDetail data={data} selectedShopId="shop-a" activePanel="basic" returnTo="dashboard" visibleUserCount={10} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を保存" }));
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("基本情報と店舗追加のパネルをURL検索条件で開く", () => {
    render(<UserDetail data={data} selectedShopId={null} returnTo="dashboard" visibleUserCount={10} />);

    fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を開く" }));
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

  it("所属店舗を押すと出発店舗を変えず専用ページへ通常pushし、戻り先情報を維持する", () => {
    render(
      <UserDetail
        data={data}
        selectedShopId="shop-a"
        returnTo="shopDetail"
        returnShopId="shop-origin"
        returnShopTo="dashboard"
        visibleUserCount={30}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "店舗別設定を開く" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/users/$personId/shops/$targetShopId",
      params: { personId: "person-1", targetShopId: "shop-b" },
      search: {
        shop: "shop-a",
        returnTo: "shopDetail",
        returnShop: "shop-origin",
        returnShopTo: "dashboard",
        users: 30,
      },
    });
    expect(mocks.navigate.mock.calls[0]?.[0]).not.toHaveProperty("replace");
  });

  it("店舗所属追加が非公開なら追加パネルとmutationを開始しない", async () => {
    mocks.featureVisibility.shopMembershipAddition = false;
    render(<UserDetail data={data} selectedShopId="shop-a" returnTo="dashboard" visibleUserCount={10} />);

    fireEvent.click(screen.getByRole("button", { name: "店舗追加を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "所属店舗を変更する" }));
    await act(async () => Promise.resolve());

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.changeMemberships).not.toHaveBeenCalled();
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

  it("所属店舗変更の完了前に別パネルへ移った場合は、そのパネルを閉じない", async () => {
    let resolveChange: ((value: boolean) => void) | undefined;
    const change = new Promise<boolean>((resolve) => {
      resolveChange = resolve;
    });
    mocks.changeMemberships.mockReturnValue(change);
    const { rerender } = render(
      <UserDetail
        data={data}
        selectedShopId="shop-a"
        activePanel="addShop"
        returnTo="dashboard"
        visibleUserCount={10}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "所属店舗を変更する" }));
    rerender(
      <UserDetail data={data} selectedShopId="shop-a" activePanel="basic" returnTo="dashboard" visibleUserCount={10} />,
    );
    await act(async () => {
      resolveChange?.(true);
      await change;
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("所属店舗変更の完了前に別人物へ移った場合は、古い応答でパネルを閉じない", async () => {
    let resolveChange: ((value: boolean) => void) | undefined;
    const change = new Promise<boolean>((resolve) => {
      resolveChange = resolve;
    });
    mocks.changeMemberships.mockReturnValue(change);
    const { rerender } = render(
      <UserDetail
        data={data}
        selectedShopId="shop-a"
        activePanel="addShop"
        returnTo="dashboard"
        visibleUserCount={10}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "所属店舗を変更する" }));
    const nextData: UserDetailData = {
      ...data,
      person: { ...data.person, id: "person-2" as UserDetailData["person"]["id"] },
    };
    rerender(
      <UserDetail
        data={nextData}
        selectedShopId="shop-a"
        activePanel="addShop"
        returnTo="dashboard"
        visibleUserCount={10}
      />,
    );
    await act(async () => {
      resolveChange?.(true);
      await change;
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("人物削除の完了前に別人物へ移った場合は、古い応答で画面遷移しない", () => {
    const { rerender } = render(
      <UserDetail data={data} selectedShopId="shop-a" activePanel="basic" returnTo="dashboard" visibleUserCount={10} />,
    );
    const previousRemovalCallback = mocks.managerOptions?.onPersonRemoved;
    const nextData: UserDetailData = {
      ...data,
      person: { ...data.person, id: "person-2" as UserDetailData["person"]["id"] },
    };

    rerender(
      <UserDetail
        data={nextData}
        selectedShopId="shop-a"
        activePanel="basic"
        returnTo="dashboard"
        visibleUserCount={10}
      />,
    );
    previousRemovalCallback?.("person-1");

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("Dashboard起点で人物を削除すると削除済み人物へfocusせずDashboardへ戻る", () => {
    render(<UserDetail data={data} selectedShopId="shop-a" returnTo="dashboard" visibleUserCount={30} />);

    mocks.managerOptions?.onPersonRemoved("person-1");

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: { shop: "shop-a", users: 30 },
      replace: true,
    });
  });

  it("本人削除後は起点にかかわらず店舗指定を外してDashboardへ戻る", () => {
    render(
      <UserDetail data={{ ...data, isSelf: true }} selectedShopId="shop-a" returnTo="settings" visibleUserCount={30} />,
    );

    mocks.managerOptions?.onPersonRemoved("person-1");

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: { shop: undefined },
      replace: true,
    });
  });
});
