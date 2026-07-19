import { describe, expect, it } from "vitest";
import { validateShopDetailSearch } from "./shops.$shopId";

describe("店舗詳細URL", () => {
  it("店舗コンテキストだけを保持し、旧tab queryは表示状態に使わない", () => {
    expect(validateShopDetailSearch({ shop: "shop-a", tab: "settings" })).toEqual({ shop: "shop-a" });
  });

  it("空の店舗コンテキストを除く", () => {
    expect(validateShopDetailSearch({ shop: "" })).toEqual({});
  });
});
