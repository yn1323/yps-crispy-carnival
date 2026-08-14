// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopDetailView } from "./ShopDetailView";
import type { ShopDetailData } from "./types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  historyBack: vi.fn(),
  onDeleted: null as (() => void) | null,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.historyBack } }),
}));

vi.mock("./ShopDetailView", () => ({
  ShopDetailView: ({ organizationSettingsShopId, onBack, onOpenUser }: ComponentProps<typeof ShopDetailView>) => (
    <>
      <output aria-label="組織設定の店舗コンテキスト">{organizationSettingsShopId}</output>
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
  useShopDeletionController: ({ onDeleted }: { onDeleted: () => void }) => {
    mocks.onDeleted = onDeleted;
    return { isDeleting: false, deleteShop: vi.fn() };
  },
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
  mocks.historyBack.mockReset();
  mocks.onDeleted = null;
});

describe("店舗詳細の戻り先", () => {
  it("組織設定への導線は表示対象店舗ではなく現在の店舗コンテキストを維持する", () => {
    render(
      <ShopDetail
        shop={shop}
        people={[]}
        selectedShopId="shop-context"
        deletionReturnShopId="shop-survivor"
        returnTo="settings"
      />,
    );

    expect(screen.getByLabelText("組織設定の店舗コンテキスト").textContent).toBe("shop-context");
  });

  it("Dashboardから開いた場合はブラウザ履歴へ戻る", () => {
    render(
      <ShopDetail
        shop={shop}
        people={[]}
        selectedShopId="shop-context"
        deletionReturnShopId="shop-survivor"
        returnTo="dashboard"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("戻り先の指定がない直URLでもブラウザ履歴へ戻る", () => {
    render(<ShopDetail shop={shop} people={[]} selectedShopId="shop-context" deletionReturnShopId="shop-survivor" />);

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("組織設定から開いた場合もブラウザ履歴へ戻る", () => {
    render(
      <ShopDetail
        shop={shop}
        people={[]}
        selectedShopId="shop-context"
        deletionReturnShopId="shop-survivor"
        returnTo="settings"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("Appのタイトル戻るも固定の管理画面へ置き換えず履歴へ戻る", () => {
    render(
      <ShopDetail
        shop={shop}
        people={[]}
        selectedShopId="shop-context"
        deletionReturnShopId="shop-survivor"
        appOrganizationId={"organization-app" as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("Dashboard起点をユーザー詳細との往復後も維持する", () => {
    render(
      <ShopDetail
        shop={shop}
        people={[]}
        selectedShopId="shop-context"
        deletionReturnShopId="shop-survivor"
        returnTo="dashboard"
      />,
    );

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

  it("削除成功後は削除対象ではなく生存店舗のDashboardへ戻る", () => {
    render(
      <ShopDetail
        shop={shop}
        people={[]}
        selectedShopId="shop-target"
        deletionReturnShopId="shop-survivor"
        returnTo="dashboard"
      />,
    );

    mocks.onDeleted?.();

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/dashboard",
      search: { shop: "shop-survivor" },
      replace: true,
    });
  });

  it("組織設定起点の削除成功後も生存店舗の店舗タブへ戻る", () => {
    render(
      <ShopDetail
        shop={shop}
        people={[]}
        selectedShopId="shop-target"
        deletionReturnShopId="shop-survivor"
        returnTo="settings"
      />,
    );

    mocks.onDeleted?.();

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/settings",
      search: { shop: "shop-survivor", tab: "shops" },
      replace: true,
    });
  });
});
