import { describe, expect, it } from "vitest";
import { validateUserDetailSearch } from "./users.$personId";

describe("ユーザー詳細URL", () => {
  it.each(["basic", "addShop"] as const)("panel=%sを表示対象として受け付ける", (panel) => {
    expect(validateUserDetailSearch({ panel })).toEqual({ panel });
  });

  it("廃止したpanel=shopはshopを維持して破棄する", () => {
    expect(validateUserDetailSearch({ shop: "shop-b", panel: "shop" })).toEqual({
      shop: "shop-b",
    });
  });

  it("shopがなくても廃止したpanel=shopは破棄する", () => {
    expect(validateUserDetailSearch({ panel: "shop" })).toEqual({});
  });

  it("panelがない場合はパネルを開かない", () => {
    expect(validateUserDetailSearch({})).toEqual({});
  });

  it("不正なpanelは破棄する", () => {
    expect(validateUserDetailSearch({ panel: "unknown" })).toEqual({});
  });

  it("廃止したtabパラメーターは破棄する", () => {
    expect(validateUserDetailSearch({ tab: "line" })).toEqual({});
  });

  it("表示店舗、有効なパネル、戻り先の有効値を保持する", () => {
    expect(
      validateUserDetailSearch({
        shop: "shop-b",
        panel: "basic",
        returnTo: "settings",
        returnShopTo: "dashboard",
        users: "30",
      }),
    ).toEqual({
      shop: "shop-b",
      panel: "basic",
      returnTo: "settings",
      users: 30,
    });
  });

  it("表示店舗がある場合は店舗詳細を戻り先として保持する", () => {
    expect(validateUserDetailSearch({ shop: "shop-b", returnTo: "shopDetail" })).toEqual({
      shop: "shop-b",
      returnTo: "shopDetail",
      returnShop: "shop-b",
    });
  });

  it("店舗詳細の出発元を表示店舗とは別に保持する", () => {
    expect(
      validateUserDetailSearch({
        shop: "shop-b",
        returnTo: "shopDetail",
        returnShop: "shop-a",
        returnShopTo: "dashboard",
      }),
    ).toEqual({
      shop: "shop-b",
      returnTo: "shopDetail",
      returnShop: "shop-a",
      returnShopTo: "dashboard",
    });
  });

  it("表示店舗がない場合は店舗詳細を戻り先にしない", () => {
    expect(validateUserDetailSearch({ returnTo: "shopDetail" })).toEqual({});
  });

  it("不正な一覧表示件数は戻り先へ引き継がない", () => {
    expect(validateUserDetailSearch({ panel: "information", users: "25" })).toEqual({});
  });
});
