import { describe, expect, it } from "vitest";
import { groupShopsByOrganization, normalizeSelectedShop, normalizeShopContextOptions } from "./context";

describe("shop context", () => {
  it("旧selected-shop DTOをactive所属として読み込める", () => {
    expect(normalizeSelectedShop({ shopId: "shop-1", shopName: "渋谷店" })).toEqual({
      shopId: "shop-1",
      shopName: "渋谷店",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
    });
  });

  it("canonicalな契約プランだけを保持する", () => {
    const shops = normalizeShopContextOptions([
      { shopId: "1", shopName: "Standard店", organizationPlan: "standard" },
      { shopId: "2", shopName: "Pro店", organizationPlan: "pro" },
      { shopId: "3", shopName: "未知店", organizationPlan: "enterprise" },
    ]);

    expect(shops.map((shop) => shop.organizationPlan)).toEqual(["standard", "pro", null]);
  });

  it("壊れた保存値と不正なquery行を除外する", () => {
    expect(normalizeSelectedShop({ shopName: "店舗IDなし" })).toBeNull();
    expect(normalizeShopContextOptions([null, { shopId: "shop-1", shopName: "渋谷店" }, { shopId: 1 }])).toHaveLength(
      1,
    );
  });

  it("稼働中店舗とアーカイブ店舗を保持する", () => {
    const shops = normalizeShopContextOptions([
      { shopId: "1", shopName: "A", shopStatus: "active" },
      { shopId: "2", shopName: "B", shopStatus: "archived" },
    ]);

    expect(shops.map((shop) => shop.shopStatus)).toEqual(["active", "archived"]);
  });

  it("店舗を組織ごとにまとめて安定した順序で返す", () => {
    const shops = normalizeShopContextOptions([
      { shopId: "3", shopName: "横浜店", organizationId: "org-b", organizationName: "B社" },
      { shopId: "2", shopName: "新宿店", organizationId: "org-a", organizationName: "A社" },
      { shopId: "1", shopName: "渋谷店", organizationId: "org-a", organizationName: "A社" },
    ]);

    expect(
      groupShopsByOrganization(shops).map((group) => [group.organizationName, ...group.shops.map((s) => s.shopName)]),
    ).toEqual([
      ["A社", "渋谷店", "新宿店"],
      ["B社", "横浜店"],
    ]);
  });

  it("組織IDがない移行中店舗を表示名だけで同じ組織にまとめない", () => {
    const shops = normalizeShopContextOptions([
      { shopId: "legacy-a", shopName: "渋谷店" },
      { shopId: "legacy-b", shopName: "新宿店" },
    ]);

    expect(
      groupShopsByOrganization(shops).map((group) => ({
        key: group.key,
        organizationName: group.organizationName,
        shopIds: group.shops.map((shop) => shop.shopId),
      })),
    ).toEqual([
      { key: "legacy:legacy-a", organizationName: "渋谷店の組織", shopIds: ["legacy-a"] },
      { key: "legacy:legacy-b", organizationName: "新宿店の組織", shopIds: ["legacy-b"] },
    ]);
  });
});
