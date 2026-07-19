import { describe, expect, it } from "vitest";
import { validateShopDetailSearch } from "./shops.$shopId";

describe("店舗詳細URL", () => {
  it.each(["information", "settings"] as const)("tab=%sを表示対象として受け付ける", (tab) => {
    expect(validateShopDetailSearch({ shop: "shop-a", tab })).toEqual({ shop: "shop-a", tab });
  });

  it("不正な値は既定タブへ戻し、空の店舗コンテキストを除く", () => {
    expect(validateShopDetailSearch({ shop: "", tab: "unknown" })).toEqual({ tab: "information" });
  });
});
