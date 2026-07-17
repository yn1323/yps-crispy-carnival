// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const mocks = vi.hoisted(() => ({
  myShopsQuery: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  navigate: vi.fn(),
  setSelectedShop: vi.fn(),
  useQuery: vi.fn(),
  useAtom: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtom: mocks.useAtom,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { dashboard: { queries: { getMyShops: mocks.myShopsQuery } } },
}));

vi.mock("@/src/stores/shop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/stores/shop")>()),
  selectedShopAtom: mocks.selectedShopAtom,
}));

import { ShopSwitcher } from ".";

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
  mocks.setSelectedShop.mockReset();
  mocks.useQuery.mockReset();
  mocks.useAtom.mockReset();

  mocks.useQuery.mockReturnValue([
    {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: "org-a",
      organizationName: "A社",
      organizationPlan: "business",
      memberStatus: "active",
    },
    {
      shopId: "shop-b",
      shopName: "B店",
      shopStatus: "active",
      organizationId: "org-b",
      organizationName: "B社",
      organizationPlan: "pro",
      memberStatus: "active",
    },
  ]);
  mocks.useAtom.mockReturnValue([
    {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: "org-a",
      organizationName: "A社",
      organizationPlan: "business",
      memberStatus: "active",
    },
    mocks.setSelectedShop,
  ]);
});

describe("ShopSwitcher", () => {
  it("店舗選択を保存してからDashboardへreplace遷移する", async () => {
    render(
      <ChakraProvider>
        <ShopSwitcher />
      </ChakraProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /店舗を切り替える/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /B店/ }));

    await waitFor(() => {
      expect(mocks.setSelectedShop).toHaveBeenCalledWith({
        shopId: "shop-b",
        shopName: "B店",
        shopStatus: "active",
        organizationId: "org-b",
        organizationName: "B社",
        organizationPlan: "pro",
        memberStatus: "active",
      });
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
    });
    expect(mocks.setSelectedShop.mock.invocationCallOrder[0]).toBeLessThan(mocks.navigate.mock.invocationCallOrder[0]);
  });
});
