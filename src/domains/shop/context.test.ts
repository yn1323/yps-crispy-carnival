import { describe, expect, it } from "vitest";
import { groupShopsByOrganization, normalizeSelectedShop, normalizeShopContextOptions } from "./context";

describe("shop context", () => {
  it("canonicalなselected-shop DTOを読み込める", () => {
    expect(
      normalizeSelectedShop({
        shopId: "shop-1",
        shopName: "渋谷店",
        organizationId: "org-1",
        organizationName: "A社",
        organizationPlan: "standard",
      }),
    ).toEqual({
      shopId: "shop-1",
      shopName: "渋谷店",
      organizationId: "org-1",
      organizationName: "A社",
      organizationPlan: "standard",
    });
  });

  it("canonicalな必須項目と契約プランを持つ行だけを保持する", () => {
    const shops = normalizeShopContextOptions([
      {
        shopId: "1",
        shopName: "Standard店",
        organizationId: "org-1",
        organizationName: "A社",
        organizationPlan: "standard",
      },
      {
        shopId: "2",
        shopName: "Pro店",
        organizationId: "org-2",
        organizationName: "B社",
        organizationPlan: "pro",
      },
      {
        shopId: "3",
        shopName: "未知店",
        organizationId: "org-3",
        organizationName: "C社",
        organizationPlan: "enterprise",
      },
    ]);

    expect(shops.map((shop) => shop.organizationPlan)).toEqual(["standard", "pro"]);
  });

  it("必須組織情報がない保存値と不正なquery行を除外する", () => {
    expect(normalizeSelectedShop({ shopName: "店舗IDなし" })).toBeNull();
    expect(normalizeShopContextOptions([null, { shopId: "shop-1", shopName: "渋谷店" }, { shopId: 1 }])).toEqual([]);
  });

  it("店舗を組織ごとにまとめて安定した順序で返す", () => {
    const shops = normalizeShopContextOptions([
      {
        shopId: "3",
        shopName: "横浜店",
        organizationId: "org-b",
        organizationName: "B社",
        organizationPlan: "pro",
      },
      {
        shopId: "2",
        shopName: "新宿店",
        organizationId: "org-a",
        organizationName: "A社",
        organizationPlan: "standard",
      },
      {
        shopId: "1",
        shopName: "渋谷店",
        organizationId: "org-a",
        organizationName: "A社",
        organizationPlan: "standard",
      },
    ]);

    expect(
      groupShopsByOrganization(shops).map((group) => [group.organizationName, ...group.shops.map((s) => s.shopName)]),
    ).toEqual([
      ["A社", "渋谷店", "新宿店"],
      ["B社", "横浜店"],
    ]);
  });
});
