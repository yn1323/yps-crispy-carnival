import { describe, expect, it } from "vitest";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { buildOperationContextModel } from "./script";

const shop = (
  shopId: string,
  shopName: string,
  organizationId: string,
  organizationName: string,
): ShopContextOption => ({
  shopId,
  shopName,
  organizationId,
  organizationName,
  organizationPlan: "standard",
});

describe("Dashboardの操作先", () => {
  it("1組織1店舗では選択組織を保持して店舗を静的表示にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({
      canSwitchShop: false,
      selectedGroup: { key: "org-a", organizationName: "Aグループ" },
    });
  });

  it("1組織複数店舗では選択組織を保持して店舗を切替可能にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ"), shop("shop-b", "B店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({
      canSwitchShop: true,
      selectedGroup: { key: "org-a", organizationName: "Aグループ" },
    });
  });

  it("別組織に店舗があっても現在組織に1店舗なら店舗切替を表示しない", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-e", "E店", "org-c", "Cグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
      shop("shop-b", "B店", "org-b", "Bグループ"),
      shop("shop-d", "D店", "org-c", "Cグループ"),
    ];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({
      canSwitchShop: false,
      selectedGroup: { key: "org-a", shops: [{ shopId: "shop-a" }] },
    });
  });

  it("選択中の組織にある店舗だけを表示モデルに保持する", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-b", "B店", "org-a", "Aグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
      shop("shop-d", "D店", "org-b", "Bグループ"),
    ];

    const model = buildOperationContextModel(shops, "shop-c");

    expect(model).toMatchObject({
      canSwitchShop: true,
      selectedGroup: {
        key: "org-b",
        organizationName: "Bグループ",
        shops: [{ shopId: "shop-c" }, { shopId: "shop-d" }],
      },
      selectedShop: { shopId: "shop-c" },
    });
  });

  it("現在の選択店舗が候補にない場合は表示モデルを作らない", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    expect(buildOperationContextModel(shops, "shop-missing")).toBeNull();
  });
});
