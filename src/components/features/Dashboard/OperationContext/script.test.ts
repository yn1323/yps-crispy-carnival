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
  organizationPlan: "standard",
  memberStatus: "active",
});

describe("Dashboardの操作先", () => {
  it("1組織1店舗では選択組織を保持して店舗を静的表示にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({
      hasMultipleGroups: false,
      canSwitchShop: false,
      selectedGroup: { key: "org-a", organizationName: "Aグループ" },
      organizationChangeOptions: [],
    });
  });

  it("1組織複数店舗では選択組織を保持して店舗を切替可能にする", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ"), shop("shop-b", "B店", "org-a", "Aグループ")];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({
      hasMultipleGroups: false,
      canSwitchShop: true,
      selectedGroup: { key: "org-a", organizationName: "Aグループ" },
      organizationChangeOptions: [],
    });
  });

  it("複数組織では現在組織を除き、各組織の名称順先頭店舗を変更先にする", () => {
    const shops = [
      shop("shop-a", "A店", "org-a", "Aグループ"),
      shop("shop-e", "E店", "org-c", "Cグループ"),
      shop("shop-c", "C店", "org-b", "Bグループ"),
      shop("shop-b", "B店", "org-b", "Bグループ"),
      shop("shop-d", "D店", "org-c", "Cグループ"),
    ];

    const model = buildOperationContextModel(shops, "shop-a");

    expect(model).toMatchObject({
      hasMultipleGroups: true,
      canSwitchShop: true,
      organizationChangeOptions: [
        {
          key: "org-b",
          organizationName: "Bグループ",
          shopId: "shop-b",
        },
        {
          key: "org-c",
          organizationName: "Cグループ",
          shopId: "shop-d",
        },
      ],
    });
  });

  it("複数組織では選択中店舗の組織を表示モデルに保持する", () => {
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
      organizationChangeOptions: [
        {
          key: "org-a",
          organizationName: "Aグループ",
          shopId: "shop-a",
        },
      ],
    });
  });

  it("現在の選択店舗が候補にない場合は表示モデルを作らない", () => {
    const shops = [shop("shop-a", "A店", "org-a", "Aグループ")];

    expect(buildOperationContextModel(shops, "shop-missing")).toBeNull();
  });
});
