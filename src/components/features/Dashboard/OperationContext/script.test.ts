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
  shopStatus: "active",
  organizationId,
  organizationName,
  organizationPlan: "pro",
  memberStatus: "active",
});

describe("Dashboardの操作先", () => {
  it("1グループ1店舗ではグループ名を隠して店舗を静的表示にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({ hasMultipleGroups: false, canSwitchShop: false });
  });

  it("1グループ複数店舗ではグループ名を隠して店舗を切替可能にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ"), shop("shop-b", "B店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({ hasMultipleGroups: false, canSwitchShop: true });
  });

  it("複数グループでは選択グループが1店舗でも全店舗を切替可能にする", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-b", "B店", "org-b", "Bグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
    ];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({ hasMultipleGroups: true, canSwitchShop: true });
  });

  it("複数グループでは選択中店舗のグループを表示モデルに保持する", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-b", "B店", "org-a", "Aグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
    ];

    const model = buildOperationContextModel(shops, "shop-c");

    expect(model).toMatchObject({
      hasMultipleGroups: true,
      canSwitchShop: true,
      selectedGroup: { key: "org-b", organizationName: "Bグループ" },
      selectedShop: { shopId: "shop-c" },
    });
  });

  it("現在の選択店舗が候補にない場合は表示モデルを作らない", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    expect(buildOperationContextModel(shops, "shop-missing")).toBeNull();
  });
});
