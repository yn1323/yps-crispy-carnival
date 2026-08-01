// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const mocks = vi.hoisted(() => ({
  getMyShops: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  featureVisibilityAtom: Symbol("featureVisibilityAtom"),
  featureVisibility: {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: true,
  },
  navigate: vi.fn(),
  useQuery: vi.fn(),
  useAtomValue: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: mocks.useAtomValue,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { dashboard: { queries: { getMyShops: mocks.getMyShops } } },
}));

vi.mock("@/src/stores/shop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/stores/shop")>()),
  selectedShopAtom: mocks.selectedShopAtom,
}));

vi.mock("@/src/stores/user", () => ({
  featureVisibilityAtom: mocks.featureVisibilityAtom,
}));

import { OperationContext } from ".";

const shops = [
  {
    shopId: "shop-a",
    shopName: "A店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "Aグループ",
    organizationPlan: "pro",
    memberStatus: "active",
  },
  {
    shopId: "shop-b",
    shopName: "B店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "Aグループ",
    organizationPlan: "pro",
    memberStatus: "active",
  },
  {
    shopId: "shop-c",
    shopName: "C店",
    shopStatus: "active",
    organizationId: "organization-b",
    organizationName: "Bグループ",
    organizationPlan: "pro",
    memberStatus: "active",
  },
] as const;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  mocks.navigate.mockReset();
  mocks.useQuery.mockReturnValue(shops);
  Object.assign(mocks.featureVisibility, {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: true,
  });
  mocks.useAtomValue.mockImplementation((target) =>
    target === mocks.featureVisibilityAtom ? mocks.featureVisibility : shops[0],
  );
});

const renderContext = (
  contextShops: readonly ShopContextOption[] = shops,
  selectedShop: ShopContextOption = contextShops[0] as ShopContextOption,
) =>
  render(
    <ChakraProvider>
      <OperationContext data={{ shops: contextShops, selectedShop }} />
    </ChakraProvider>,
  );

describe("OperationContext", () => {
  it("店舗セレクトで選んだ店舗をshop queryに指定してDashboardへ遷移する", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える（現在：A店）" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /B店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-b" } });
    });
  });

  it("別グループの店舗も同じ店舗セレクトから選べる", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える（現在：A店）" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /C店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-c" } });
    });
  });

  it("現在店舗を表示対象とコンテキストにして店舗詳細へ遷移する", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗詳細を開く" }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/shops/$shopId",
        params: { shopId: "shop-a" },
        search: { shop: "shop-a", returnTo: "dashboard" },
      });
    });
  });

  it("現在店舗のグループ設定へ遷移する", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "グループ設定" }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/settings", search: { shop: "shop-a" } });
    });
  });

  it("設定内の機能がすべて非公開ならグループ設定への導線を表示しない", () => {
    Object.assign(mocks.featureVisibility, {
      organizationSettingsNavigation: false,
      billing: false,
      shopMembershipAddition: false,
    });

    renderContext();

    expect(screen.queryByRole("button", { name: "グループ設定" })).toBeNull();
    expect(screen.getByRole("button", { name: "店舗詳細を開く" })).not.toBeNull();
  });

  it("1グループ1店舗ではグループ名と切替操作を表示しない", () => {
    renderContext([shops[0]], shops[0]);

    expect(screen.getByText("A店")).not.toBeNull();
    expect(screen.queryByText("Aグループ")).toBeNull();
    expect(screen.queryByRole("button", { name: /店舗を切り替える/ })).toBeNull();
    expect(screen.getByRole("button", { name: "店舗詳細を開く" })).not.toBeNull();
  });
});
