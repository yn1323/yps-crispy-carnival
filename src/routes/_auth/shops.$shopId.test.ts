import { describe, expect, it } from "vitest";
import { validateShopDetailSearch } from "./shops.$shopId";

describe("店舗詳細URL", () => {
  it("店舗コンテキストとDashboardへの戻り先を保持し、旧tab queryは表示状態に使わない", () => {
    expect(validateShopDetailSearch({ shop: "shop-a", returnTo: "dashboard", tab: "settings" })).toEqual({
      shop: "shop-a",
      returnTo: "dashboard",
    });
  });

  it("空の店舗コンテキストと不正な戻り先を除く", () => {
    expect(validateShopDetailSearch({ shop: "", returnTo: "settings" })).toEqual({});
  });
});
