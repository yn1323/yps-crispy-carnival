import { describe, expect, it } from "vitest";
import { clearRequestedShopSearch, normalizeShopSearch, updateSettingsTabSearch } from "./authenticatedSearch";

describe("authenticated search", () => {
  it("店舗URLを正規化するとき既存のsearchを保持する", () => {
    expect(normalizeShopSearch({ tab: "shops" }, "shop-a")).toEqual({ tab: "shops", shop: "shop-a" });
  });

  it("無効な要求店舗からDashboardへ戻るときshopを消す", () => {
    expect(clearRequestedShopSearch()).toEqual({ shop: undefined });
  });

  it("Settingsのタブ変更でshopを保持し、既定タブだけURLから省く", () => {
    expect(updateSettingsTabSearch({ shop: "shop-a", tab: "billing" }, "people")).toEqual({
      shop: "shop-a",
      tab: undefined,
    });
    expect(updateSettingsTabSearch({ shop: "shop-a" }, "shops")).toEqual({
      shop: "shop-a",
      tab: "shops",
    });
  });
});
