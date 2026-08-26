// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const mocks = vi.hoisted(() => ({
  getMyShops: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  useQuery: vi.fn(),
  useAtomValue: vi.fn(),
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
    organizationPlan: "standard",
  },
  {
    shopId: "shop-b",
    shopName: "B店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "Aグループ",
    organizationPlan: "standard",
  },
  {
    shopId: "shop-c",
    shopName: "C店",
    shopStatus: "active",
    organizationId: "organization-b",
    organizationName: "Bグループ",
    organizationPlan: "standard",
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
  mocks.useQuery.mockReturnValue(shops);
  mocks.useAtomValue.mockReturnValue(shops[0]);
});

const renderContext = (
  contextShops: readonly ShopContextOption[] = shops,
  selectedShop: ShopContextOption = contextShops[0] as ShopContextOption,
  props: {
    onOpenShopDetail?: (shopId: string) => void;
    onSelect?: (shop: ShopContextOption) => void;
  } = {},
) => {
  const { onSelect, ...contextProps } = props;
  return render(
    <ChakraProvider>
      <OperationContext
        data={{
          shops: contextShops,
          selectedShop,
          ...(onSelect ? { onSelect } : {}),
        }}
        {...contextProps}
      />
    </ChakraProvider>,
  );
};

describe("OperationContext", () => {
  it("queryから店舗候補を読む場合はcanonical plan ID契約を指定する", () => {
    render(
      <ChakraProvider>
        <OperationContext />
      </ChakraProvider>,
    );

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.getMyShops, { planIdVersion: 2 });
  });

  it("店舗セレクトで選んだ店舗をcallbackへ返す", async () => {
    const onSelect = vi.fn();
    renderContext(shops, shops[0], { onSelect });

    expect(screen.getByText("店舗", { exact: true })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える（現在：A店）" }));
    const nextShop = await screen.findByRole("menuitem", { name: /B店/ });
    expect(screen.queryByRole("menuitem", { name: /C店/ })).toBeNull();
    fireEvent.click(nextShop);

    expect(onSelect).toHaveBeenCalledWith(shops[1]);
  });

  it("app routeでは既存UIから渡された店舗詳細callbackを使う", () => {
    const onOpenShopDetail = vi.fn();
    renderContext(shops, shops[0], { onOpenShopDetail });

    fireEvent.click(screen.getByRole("button", { name: "店舗詳細を開く" }));

    expect(onOpenShopDetail).toHaveBeenCalledWith("shop-a");
  });

  it("1組織1店舗では店舗切替を表示しない", () => {
    renderContext([shops[0]], shops[0]);

    expect(screen.getByText("店舗", { exact: true })).not.toBeNull();
    expect(screen.getAllByText("A店")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /店舗を切り替える/ })).toBeNull();
    expect(screen.getByRole("button", { name: "店舗詳細を開く" })).not.toBeNull();
  });
});
