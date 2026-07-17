// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectedShop = {
  shopId: string;
  shopName: string;
  shopStatus: "active" | "archived" | "planSuspended";
  organizationId: string | null;
  organizationName: string | null;
  organizationPlan: "trial" | "free" | "pro" | "business" | null;
  memberStatus: "active" | "readOnly" | "removed";
} | null;

type ShopRow = {
  shopId: string;
  shopName: string;
  shopStatus?: "active" | "archived" | "planSuspended";
  organizationId?: string;
  organizationName?: string;
  organizationPlan?: "trial" | "free" | "pro" | "business";
  memberStatus?: "active" | "readOnly" | "removed";
};

const mocks = vi.hoisted(() => ({
  currentUserQuery: Symbol("getCurrentUser"),
  myShopsQuery: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  userAtom: Symbol("userAtom"),
  useAuth: vi.fn(),
  useQuery: vi.fn(),
  useRouterState: vi.fn(),
  navigate: vi.fn(),
  useAtom: vi.fn(),
  setSelectedShop: vi.fn(),
  setUser: vi.fn(),
  managerChildRender: vi.fn(),
  currentUser: { name: "管理者", email: "manager@example.com" },
  myShops: [{ shopId: "active-shop", shopName: "所属店舗" }] as ShopRow[],
  selectedShop: null as SelectedShop,
  user: { authId: "manager-user", name: "管理者", email: "manager@example.com" },
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useRouterState: mocks.useRouterState,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtom: mocks.useAtom,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: {
      queries: {
        getCurrentUser: mocks.currentUserQuery,
        getMyShops: mocks.myShopsQuery,
      },
    },
  },
}));

vi.mock("@/src/components/templates/FullPageSpinner", () => ({
  FullPageSpinner: () => <div data-testid="full-page-spinner" />,
}));

vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </main>
  ),
}));

vi.mock("@/src/stores/shop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/stores/shop")>()),
  selectedShopAtom: mocks.selectedShopAtom,
}));

vi.mock("@/src/stores/user", () => ({
  userAtom: mocks.userAtom,
}));

import { AuthGuard } from "./AuthGuard";

const ManagerChild = () => {
  mocks.managerChildRender();
  return <div data-testid="manager-child" />;
};

beforeEach(() => {
  mocks.useAuth.mockReset();
  mocks.useQuery.mockReset();
  mocks.useRouterState.mockReset();
  mocks.navigate.mockReset();
  mocks.useAtom.mockReset();
  mocks.setSelectedShop.mockReset();
  mocks.setUser.mockReset();
  mocks.managerChildRender.mockReset();

  mocks.myShops = [{ shopId: "active-shop", shopName: "所属店舗" }];
  mocks.selectedShop = {
    shopId: "stale-shop",
    shopName: "過去の所属店舗",
    shopStatus: "active",
    organizationId: null,
    organizationName: null,
    organizationPlan: null,
    memberStatus: "active",
  };
  mocks.user = { authId: "manager-user", name: "管理者", email: "manager@example.com" };

  mocks.useAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "manager-user",
  });
  mocks.useRouterState.mockReturnValue({ pathname: "/dashboard", searchStr: "" });
  mocks.useQuery.mockImplementation((queryReference: unknown) => {
    if (queryReference === mocks.currentUserQuery) return mocks.currentUser;
    if (queryReference === mocks.myShopsQuery) return mocks.myShops;
    throw new Error("Unexpected query reference");
  });
  mocks.useAtom.mockImplementation((targetAtom: unknown) => {
    if (targetAtom === mocks.userAtom) return [mocks.user, mocks.setUser];
    if (targetAtom === mocks.selectedShopAtom) return [mocks.selectedShop, mocks.setSelectedShop];
    throw new Error("Unexpected atom");
  });
});

describe("AuthGuard", () => {
  it("保存済みの不所属店舗を整合するまではmanager子画面を描画しない", async () => {
    const { rerender } = render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({
        shopId: "active-shop",
        shopName: "所属店舗",
        shopStatus: "active",
        organizationId: null,
        organizationName: null,
        organizationPlan: null,
        memberStatus: "active",
      });
    });

    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };
    rerender(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("URLがなく保存値も無効なら複数候補の先頭を保存してURLをreplace正規化する", async () => {
    mocks.myShops = [
      { shopId: "shop-a", shopName: "A店", organizationId: "org-a", organizationName: "A社" },
      { shopId: "shop-b", shopName: "B店", organizationId: "org-b", organizationName: "B社" },
    ];

    const { rerender } = render(
      <AuthGuard onNormalizeShopUrl={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({
        shopId: "shop-a",
        shopName: "A店",
        shopStatus: "active",
        organizationId: "org-a",
        organizationName: "A社",
        organizationPlan: null,
        memberStatus: "active",
      });
    });
    expect(mocks.managerChildRender).not.toHaveBeenCalled();

    mocks.selectedShop = {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: "org-a",
      organizationName: "A社",
      organizationPlan: null,
      memberStatus: "active",
    };
    rerender(
      <AuthGuard onNormalizeShopUrl={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("shop-a"));

    rerender(
      <AuthGuard requestedShopId="shop-a" onNormalizeShopUrl={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).not.toBeNull();
  });

  it("同じ店舗でも契約プランが変わったら選択コンテキストを最新化する", async () => {
    mocks.myShops = [
      {
        shopId: "active-shop",
        shopName: "所属店舗",
        organizationId: "organization-a",
        organizationName: "A社",
        organizationPlan: "business",
      },
    ];
    mocks.selectedShop = {
      shopId: "active-shop",
      shopName: "所属店舗",
      shopStatus: "active",
      organizationId: "organization-a",
      organizationName: "A社",
      organizationPlan: "pro",
      memberStatus: "active",
    };

    render(
      <AuthGuard requestedShopId="active-shop">
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({
        ...mocks.selectedShop,
        organizationPlan: "business",
      });
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("所属店舗がなくなったら古い選択を消すまで子画面を描画せず、ログアウトせずに続行する", async () => {
    mocks.myShops = [];
    mocks.selectedShop = {
      shopId: "removed-shop",
      shopName: "権限を失った店舗",
      shopStatus: "active",
      organizationId: "removed-organization",
      organizationName: "権限を失ったグループ",
      organizationPlan: "free",
      memberStatus: "active",
    };
    const { rerender } = render(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    expect(screen.queryByText("権限を失った店舗")).toBeNull();
    expect(screen.queryByText("権限を失ったグループ")).toBeNull();
    await waitFor(() => expect(mocks.setSelectedShop).toHaveBeenCalledWith(null));

    mocks.selectedShop = null;
    rerender(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("full-page-spinner")).toBeNull();
    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(screen.queryByTestId("navigate")).toBeNull();
    expect(mocks.useAuth).toHaveReturnedWith(expect.objectContaining({ isSignedIn: true, userId: "manager-user" }));
  });

  it("明示されたURL店舗が候補外ならfallbackせず汎用エラーを表示する", () => {
    mocks.myShops = [
      { shopId: "shop-a", shopName: "A店" },
      { shopId: "shop-b", shopName: "B店" },
    ];
    mocks.selectedShop = {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    };

    render(
      <AuthGuard requestedShopId="unknown-shop" onReturnToDashboard={mocks.navigate}>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.getByRole("heading", { name: "この店舗を開けません" })).not.toBeNull();
    expect(screen.queryByText("unknown-shop")).toBeNull();
    expect(mocks.setSelectedShop).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ダッシュボードへ戻る" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});
