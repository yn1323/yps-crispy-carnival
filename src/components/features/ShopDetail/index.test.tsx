// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopDetailView } from "./ShopDetailView";
import type { ShopDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("./ShopDetailView", () => ({
  ShopDetailView: ({ onBack, onOpenUser }: ComponentProps<typeof ShopDetailView>) => (
    <>
      <button type="button" onClick={onBack}>
        前の画面に戻る
      </button>
      <button type="button" onClick={() => onOpenUser("person-a")}>
        スタッフ詳細を開く
      </button>
    </>
  ),
}));

vi.mock("./useShopDeletionController", () => ({
  useShopDeletionController: () => ({ isDeleting: false, deleteShop: vi.fn() }),
}));

vi.mock("./useShopSettingsController", () => ({
  useShopSettingsController: () => ({
    dialog: { isOpen: false, onOpenChange: vi.fn(), open: vi.fn(), close: vi.fn() },
    updateSettings: vi.fn(),
  }),
}));

import { ShopDetail } from ".";

const shop: ShopDetailData = {
  id: "shop-target",
  name: "新宿店",
  regularClosedDays: [],
  submissionPattern: { kind: "dateOnly" },
  canUpdateSettings: true,
  canDelete: true,
};

beforeEach(() => {
  mocks.navigate.mockReset();
});

describe("店舗詳細の戻り先", () => {
  it("Dashboardから開いた場合は同じ店舗のDashboardへ戻る", () => {
    render(<ShopDetail shop={shop} people={[]} selectedShopId="shop-context" returnTo="dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/dashboard",
      search: { shop: "shop-context" },
      replace: true,
    });
  });

  it("戻り先の指定がない直URLではDashboardへ戻る", () => {
    render(<ShopDetail shop={shop} people={[]} selectedShopId="shop-context" />);

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/dashboard",
      search: { shop: "shop-context" },
      replace: true,
    });
  });

  it("グループ設定から開いた場合だけ同じグループ設定へ戻る", () => {
    render(<ShopDetail shop={shop} people={[]} selectedShopId="shop-context" returnTo="settings" />);

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/settings",
      search: { shop: "shop-context", tab: "shops" },
      replace: true,
    });
  });

  it("Dashboard起点をユーザー詳細との往復後も維持する", () => {
    render(<ShopDetail shop={shop} people={[]} selectedShopId="shop-context" returnTo="dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: "スタッフ詳細を開く" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/users/$personId",
      params: { personId: "person-a" },
      search: {
        shop: "shop-target",
        returnTo: "shopDetail",
        returnShop: "shop-target",
        returnShopTo: "dashboard",
      },
    });
  });
});
