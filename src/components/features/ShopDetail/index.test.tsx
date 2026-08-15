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
  deletionInput: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.historyBack } }),
}));

vi.mock("./ShopDetailView", () => ({
  ShopDetailView: ({ onBack, onOpenUser, isShopAdditionEnabled }: ComponentProps<typeof ShopDetailView>) => (
    <>
      <output data-testid="shop-addition-enabled">{String(isShopAdditionEnabled)}</output>
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
  useShopDeletionController: (input: { onDeleted: () => void }) => {
    mocks.deletionInput(input);
    mocks.onDeleted = input.onDeleted;
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
const organizationId = "organization-app" as never;

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.historyBack.mockReset();
  mocks.deletionInput.mockReset();
  mocks.onDeleted = null;
});

describe("店舗詳細のapp navigation", () => {
  it("タイトルの戻る操作はブラウザ履歴へ戻る", () => {
    render(<ShopDetail shop={shop} people={[]} organizationId={organizationId} isShopAdditionEnabled />);

    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("スタッフ詳細を同じcanonical組織scopeで開く", () => {
    render(<ShopDetail shop={shop} people={[]} organizationId={organizationId} isShopAdditionEnabled />);

    fireEvent.click(screen.getByRole("button", { name: "スタッフ詳細を開く" }));

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/app/staff/$personId",
      params: { personId: "person-a" },
      search: { org: organizationId },
    });
  });

  it("削除後はlegacy店舗contextを使わず同じ組織の管理へ戻る", () => {
    render(<ShopDetail shop={shop} people={[]} organizationId={organizationId} isShopAdditionEnabled={false} />);

    expect(mocks.deletionInput).toHaveBeenCalledWith(
      expect.objectContaining({ expectedOrganizationId: organizationId, clearLegacySelectedShop: false }),
    );
    mocks.onDeleted?.();

    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/app/manage",
      search: { org: organizationId },
      replace: true,
    });
    expect(screen.getByTestId("shop-addition-enabled").textContent).toBe("false");
  });
});
