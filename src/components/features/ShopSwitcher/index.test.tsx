// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const mocks = vi.hoisted(() => ({
  myShopsQuery: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
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
  mocks.useQuery.mockReset();
  mocks.useAtomValue.mockReset();

  mocks.useQuery.mockReturnValue([
    {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: "org-a",
      organizationName: "A社",
      organizationPlan: "pro",
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
  mocks.useAtomValue.mockReturnValue({
    shopId: "shop-a",
    shopName: "A店",
    shopStatus: "active",
    organizationId: "org-a",
    organizationName: "A社",
    organizationPlan: "pro",
    memberStatus: "active",
  });
});

describe("ShopSwitcher", () => {
  it("選んだ店舗をURLへ指定してDashboardへ遷移する", async () => {
    render(
      <ChakraProvider>
        <ShopSwitcher />
      </ChakraProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /店舗を切り替える/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /B店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-b" } });
    });
  });

  it("利用可能な店舗が一つだけなら切り替えUIを表示しない", () => {
    mocks.useQuery.mockReturnValue([
      {
        shopId: "shop-a",
        shopName: "A店",
        shopStatus: "active",
        organizationId: "org-a",
        organizationName: "A社",
        organizationPlan: "pro",
        memberStatus: "active",
      },
    ]);

    render(
      <ChakraProvider>
        <ShopSwitcher />
      </ChakraProvider>,
    );

    expect(screen.queryByRole("button", { name: /店舗を切り替える/ })).toBeNull();
  });
});
