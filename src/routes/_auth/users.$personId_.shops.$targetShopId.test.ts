import { describe, expect, it } from "vitest";
import { validateUserShopDetailSearch } from "./users.$personId_.shops.$targetShopId";

describe("ユーザー店舗別設定URL", () => {
  it("出発店舗とユーザー詳細の戻り先情報をすべて維持する", () => {
    expect(
      validateUserShopDetailSearch({
        shop: "shop-source",
        returnTo: "shopDetail",
        returnShop: "shop-origin",
        returnShopTo: "dashboard",
        users: "30",
      }),
    ).toEqual({
      shop: "shop-source",
      returnTo: "shopDetail",
      returnShop: "shop-origin",
      returnShopTo: "dashboard",
      users: 30,
    });
  });

  it("対象店舗を表していたpanel=shopは受け付けず、出発店舗だけを維持する", () => {
    expect(validateUserShopDetailSearch({ shop: "shop-source", panel: "shop" })).toEqual({
      shop: "shop-source",
    });
  });

  it("店舗詳細起点ではreturnShop未指定時に出発店舗を戻り先として補う", () => {
    expect(validateUserShopDetailSearch({ shop: "shop-source", returnTo: "shopDetail" })).toEqual({
      shop: "shop-source",
      returnTo: "shopDetail",
      returnShop: "shop-source",
    });
  });

  it("出発店舗がない場合は店舗詳細を戻り先にしない", () => {
    expect(validateUserShopDetailSearch({ returnTo: "shopDetail", returnShopTo: "dashboard" })).toEqual({});
  });

  it("不正な戻り先と一覧件数を破棄する", () => {
    expect(validateUserShopDetailSearch({ returnTo: "unknown", users: "25" })).toEqual({});
  });
});
