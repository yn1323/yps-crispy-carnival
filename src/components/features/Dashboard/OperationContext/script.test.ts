import { describe, expect, it } from "vitest";
import type { ShopContextOption } from "@/src/stores/shop";
import { buildOperationContextModel, getShopForGroupSelection } from "./script";

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
  it("1グループ1店舗では両方を静的表示にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({ canSwitchGroup: false, canSwitchShop: false });
  });

  it("1グループ複数店舗では店舗だけを切替可能にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ"), shop("shop-b", "B店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({ canSwitchGroup: false, canSwitchShop: true });
  });

  it("複数グループで選択グループが1店舗ならグループだけを切替可能にする", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-b", "B店", "org-b", "Bグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
    ];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({ canSwitchGroup: true, canSwitchShop: false });
  });

  it("複数グループで選択グループに複数店舗があれば両方を切替可能にする", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-b", "B店", "org-a", "Aグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
    ];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({ canSwitchGroup: true, canSwitchShop: true });
  });

  it("グループ切替時に現在の店舗が含まれなければ店舗名順の先頭候補を選ぶ", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
      shop("shop-b", "B店", "org-b", "Bグループ"),
    ];
    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).not.toBeNull();
    expect(getShopForGroupSelection(model?.groups ?? [], "org-b", "shop-a")?.shopId).toBe("shop-b");
  });

  it("選択中のグループを選び直した場合は現在の店舗を保つ", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ"), shop("shop-b", "B店", "org-a", "Aグループ")];
    const model = buildOperationContextModel(shops, "shop-b");

    expect(getShopForGroupSelection(model?.groups ?? [], "org-a", "shop-b")?.shopId).toBe("shop-b");
  });

  it("現在の選択店舗が候補にない場合は表示モデルを作らない", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    expect(buildOperationContextModel(shops, "shop-missing")).toBeNull();
  });
});
