import { describe, expect, it } from "vitest";
import {
  groupShopsByOrganization,
  isSelectableShop,
  normalizeSelectedShop,
  normalizeShopContextOptions,
} from "./context";

describe("shop context", () => {
  it("旧selected-shop DTOをactive所属として読み込める", () => {
    expect(normalizeSelectedShop({ shopId: "shop-1", shopName: "渋谷店" })).toEqual({
      shopId: "shop-1",
      shopName: "渋谷店",
      shopStatus: "active",
      organizationId: null,
      organizationName: null,
      organizationPlan: null,
      memberStatus: "active",
    });
  });

  it("現行の契約プランをBusinessを含めて保持する", () => {
    const shops = normalizeShopContextOptions([
      { shopId: "1", shopName: "Pro店", organizationPlan: "pro" },
      { shopId: "2", shopName: "旧Business店", organizationPlan: "business" },
      { shopId: "3", shopName: "未知店", organizationPlan: "enterprise" },
    ]);

    expect(shops.map((shop) => shop.organizationPlan)).toEqual(["pro", "business", null]);
  });

  it("壊れた保存値と不正なquery行を除外する", () => {
    expect(normalizeSelectedShop({ shopName: "店舗IDなし" })).toBeNull();
    expect(normalizeShopContextOptions([null, { shopId: "shop-1", shopName: "渋谷店" }, { shopId: 1 }])).toHaveLength(
      1,
    );
  });

  it("アーカイブ店舗は閲覧候補へ残し、削除済み所属だけを選択候補から外す", () => {
    const [active, suspended, archived, removed] = normalizeShopContextOptions([
      { shopId: "1", shopName: "A", shopStatus: "active" },
      { shopId: "2", shopName: "B", shopStatus: "planSuspended", memberStatus: "readOnly" },
      { shopId: "3", shopName: "C", shopStatus: "archived" },
      { shopId: "4", shopName: "D", shopStatus: "active", memberStatus: "removed" },
    ]);

    expect([active, suspended, archived, removed].map(isSelectableShop)).toEqual([true, true, true, false]);
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
