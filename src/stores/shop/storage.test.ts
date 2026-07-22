// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("selectedShopAtom storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("URL未指定時のfallbackに使う前回店舗を初回読込から復元する", async () => {
    localStorage.setItem(
      "selected-shop",
      JSON.stringify({
        shopId: "shop-previous",
        shopName: "前回の店舗",
        shopStatus: "active",
        organizationId: "organization-previous",
        organizationName: "前回のグループ",
        organizationPlan: "pro",
        memberStatus: "active",
      }),
    );

    const [{ createStore }, { selectedShopAtom }] = await Promise.all([import("jotai"), import(".")]);

    expect(createStore().get(selectedShopAtom)).toEqual({
      shopId: "shop-previous",
      shopName: "前回の店舗",
      shopStatus: "active",
      organizationId: "organization-previous",
      organizationName: "前回のグループ",
      organizationPlan: "pro",
      memberStatus: "active",
    });
  });

  it("別タブの前回店舗更新で実行中の店舗contextを上書きしない", async () => {
    const currentShop = {
      shopId: "shop-current",
      shopName: "現在の店舗",
      shopStatus: "active" as const,
      organizationId: "organization-current",
      organizationName: "現在のグループ",
      organizationPlan: "pro" as const,
      memberStatus: "active" as const,
    };
    const otherTabShop = {
      ...currentShop,
      shopId: "shop-other-tab",
      shopName: "別タブの店舗",
    };
    localStorage.setItem("selected-shop", JSON.stringify(currentShop));

    const [{ createStore }, { selectedShopAtom }] = await Promise.all([import("jotai"), import(".")]);
    const store = createStore();
    const unsubscribe = store.sub(selectedShopAtom, () => undefined);

    localStorage.setItem("selected-shop", JSON.stringify(otherTabShop));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "selected-shop",
        newValue: JSON.stringify(otherTabShop),
        storageArea: localStorage,
      }),
    );

    expect(store.get(selectedShopAtom)).toEqual(currentShop);
    unsubscribe();
  });
});
