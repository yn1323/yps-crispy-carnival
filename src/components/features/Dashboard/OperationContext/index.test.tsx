// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import type { ShopContextOption } from "@/src/stores/shop";

const mocks = vi.hoisted(() => ({
  getMyShops: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  navigate: vi.fn(),
  openShopSettings: vi.fn(),
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

import { OperationContext } from ".";

const shops = [
  {
    shopId: "shop-a",
    shopName: "A店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "Aグループ",
    organizationPlan: "business",
    memberStatus: "active",
  },
  {
    shopId: "shop-b",
    shopName: "B店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "Aグループ",
    organizationPlan: "business",
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
  mocks.openShopSettings.mockReset();
  mocks.useQuery.mockReturnValue(shops);
  mocks.useAtomValue.mockReturnValue(shops[0]);
});

const renderContext = (
  contextShops: readonly ShopContextOption[] = shops,
  selectedShop: ShopContextOption = contextShops[0] as ShopContextOption,
) =>
  render(
    <ChakraProvider>
      <OperationContext data={{ shops: contextShops, selectedShop }} onOpenShopSettings={mocks.openShopSettings} />
    </ChakraProvider>,
  );

describe("OperationContext", () => {
  it("店舗セレクトで選んだ店舗をshop queryに指定してDashboardへ遷移する", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える。現在はA店" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /B店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-b" } });
    });
  });

  it("別グループの店舗も同じ店舗セレクトから選べる", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える。現在はA店" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /C店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-c" } });
    });
  });

  it("店舗設定を直接開き、現在店舗のグループ設定へ遷移できる", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗設定を開く" }));
    expect(mocks.openShopSettings).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "グループ設定" }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/settings", search: { shop: "shop-a" } });
    });
  });

  it("1グループ1店舗ではグループ名と切替操作を表示しない", () => {
    renderContext([shops[0]], shops[0]);

    expect(screen.getByText("A店")).not.toBeNull();
    expect(screen.queryByText("Aグループ")).toBeNull();
    expect(screen.queryByRole("button", { name: /店舗を切り替える/ })).toBeNull();
    expect(screen.getByRole("button", { name: "店舗設定を開く" })).not.toBeNull();
  });
});
