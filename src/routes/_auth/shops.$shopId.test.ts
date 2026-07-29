import { describe, expect, it } from "vitest";
import { validateShopDetailSearch } from "./shops.$shopId";

describe("店舗詳細URL", () => {
  it("店舗コンテキストと明示した戻り先を保持し、旧tab queryは表示状態に使わない", () => {
    expect(validateShopDetailSearch({ shop: "shop-a", returnTo: "dashboard", tab: "settings" })).toEqual({
      shop: "shop-a",
      returnTo: "dashboard",
    });
    expect(validateShopDetailSearch({ shop: "shop-a", returnTo: "settings" })).toEqual({
      shop: "shop-a",
      returnTo: "settings",
    });
  });

  it("空の店舗コンテキストと不正な戻り先を除く", () => {
    expect(validateShopDetailSearch({ shop: "", returnTo: "unknown" })).toEqual({});
  });
});
