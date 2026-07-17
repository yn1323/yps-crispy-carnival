// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const mocks = vi.hoisted(() => ({
  getMyShops: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  navigate: vi.fn(),
  useQuery: vi.fn(),
  useAtomValue: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    to,
    search,
    children,
    "aria-label": ariaLabel,
  }: {
    to: string;
    search?: { shop?: string };
    children: ReactNode;
    "aria-label"?: string;
  }) => (
    <a href={`${to}${search?.shop ? `?shop=${search.shop}` : ""}`} aria-label={ariaLabel}>
      {children}
    </a>
  ),
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
  mocks.useQuery.mockReturnValue(shops);
  mocks.useAtomValue.mockReturnValue(shops[0]);
});

const renderContext = () =>
  render(
    <ChakraProvider>
      <OperationContext data={{ shops, selectedShop: shops[0] }} onOpenShopSettings={vi.fn()} />
    </ChakraProvider>,
  );

describe("OperationContext", () => {
  it("店舗カードで選んだ店舗をshop queryに指定してDashboardへ遷移する", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える。現在はA店" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /B店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-b" } });
    });
  });

  it("グループカードで選んだグループの先頭店舗をshop queryに指定する", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "グループを切り替える。現在はAグループ" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Bグループ/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-c" } });
    });
  });

  it("グループ設定リンクに現在店舗のshop queryを引き継ぐ", () => {
    renderContext();

    expect(screen.getByRole("link", { name: "Aグループのグループ設定を開く" }).getAttribute("href")).toBe(
      "/settings?shop=shop-a",
    );
  });
});
