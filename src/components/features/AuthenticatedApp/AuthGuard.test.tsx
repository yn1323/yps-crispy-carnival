// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectedShop = {
  shopId: string;
  shopName: string;
} | null;

const mocks = vi.hoisted(() => ({
  currentUserQuery: Symbol("getCurrentUser"),
  myShopsQuery: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  userAtom: Symbol("userAtom"),
  useAuth: vi.fn(),
  useQuery: vi.fn(),
  useRouterState: vi.fn(),
  useAtom: vi.fn(),
  setSelectedShop: vi.fn(),
  setUser: vi.fn(),
  managerChildRender: vi.fn(),
  currentUser: { name: "管理者", email: "manager@example.com" },
  myShops: [{ shopId: "active-shop", shopName: "所属店舗" }],
  selectedShop: null as SelectedShop,
  user: { authId: "manager-user", name: "管理者", email: "manager@example.com" },
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: () => null,
  useRouterState: mocks.useRouterState,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("jotai", () => ({
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

vi.mock("@/src/stores/shop", () => ({
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
  mocks.useAtom.mockReset();
  mocks.setSelectedShop.mockReset();
  mocks.setUser.mockReset();
  mocks.managerChildRender.mockReset();

  mocks.selectedShop = { shopId: "stale-shop", shopName: "過去の所属店舗" };
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
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).not.toHaveBeenCalled();
    expect(screen.queryByTestId("manager-child")).toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({ shopId: "active-shop", shopName: "所属店舗" });
    });

    mocks.selectedShop = { shopId: "active-shop", shopName: "所属店舗" };
    rerender(
      <AuthGuard>
        <ManagerChild />
      </AuthGuard>,
    );

    expect(mocks.managerChildRender).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("manager-child")).not.toBeNull();
    expect(screen.queryByTestId("full-page-spinner")).toBeNull();
  });
});
