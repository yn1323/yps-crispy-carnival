import { describe, expect, it } from "vitest";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { buildOrganizationContextModel } from "./script";

const shop = (overrides: Partial<ShopContextOption>): ShopContextOption => ({
  shopId: "shop-a-1",
  shopName: "A店舗",
  shopStatus: "active",
  organizationId: "organization-a",
  organizationName: "Aグループ",
  organizationPlan: "pro",
  memberStatus: "active",
  ...overrides,
});

describe("buildOrganizationContextModel", () => {
  it("選択中店舗の組織と戻り先を特定する", () => {
    const model = buildOrganizationContextModel(
      [shop({}), shop({ shopId: "shop-a-2", shopName: "B店舗" })],
      "shop-a-2",
    );

    expect(model).toEqual({
      options: [
        {
          key: "organization-a",
          organizationName: "Aグループ",
          shopId: "shop-a-2",
          isSelected: true,
        },
      ],
      selectedOrganizationName: "Aグループ",
      selectedShopId: "shop-a-2",
      selectedShopName: "B店舗",
      canSwitchOrganization: false,
    });
  });

  it("別組織の選択先には組織内で先頭の店舗を使う", () => {
    const model = buildOrganizationContextModel(
      [
        shop({}),
        shop({
          shopId: "shop-b-2",
          shopName: "D店舗",
          organizationId: "organization-b",
          organizationName: "Bグループ",
        }),
        shop({
          shopId: "shop-b-1",
          shopName: "C店舗",
          organizationId: "organization-b",
          organizationName: "Bグループ",
        }),
      ],
      "shop-a-1",
    );

    expect(model?.options).toEqual([
      {
        key: "organization-a",
        organizationName: "Aグループ",
        shopId: "shop-a-1",
        isSelected: true,
      },
      {
        key: "organization-b",
        organizationName: "Bグループ",
        shopId: "shop-b-1",
        isSelected: false,
      },
    ]);
    expect(model?.canSwitchOrganization).toBe(true);
  });

  it("選択中店舗が候補にない場合は表示モデルを作らない", () => {
    expect(buildOrganizationContextModel([shop({})], "missing-shop")).toBeNull();
  });
});
