// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("selectedShopAtom storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("storage schema v3のcanonical Proを意味を変えずに復元する", async () => {
    localStorage.setItem(
      "selected-shop",
      JSON.stringify({
        schemaVersion: 3,
        selectedShop: {
          shopId: "shop-current",
          shopName: "現在の店舗",
          organizationId: "organization-current",
          organizationName: "現在のグループ",
          organizationPlan: "pro",
        },
      }),
    );

    const [{ createStore }, { selectedShopAtom }] = await Promise.all([import("jotai"), import(".")]);

    expect(createStore().get(selectedShopAtom)).toEqual({
      shopId: "shop-current",
      shopName: "現在の店舗",
      organizationId: "organization-current",
      organizationName: "現在のグループ",
      organizationPlan: "pro",
    });
  });

  it("canonicalな選択店舗をstorage schema v3で保存する", async () => {
    const [{ createStore }, { selectedShopAtom }] = await Promise.all([import("jotai"), import(".")]);
    const store = createStore();
    const selectedShop = {
      shopId: "shop-standard",
      shopName: "Standard店舗",
      organizationId: "organization-standard",
      organizationName: "Standard組織",
      organizationPlan: "standard" as const,
    };

    store.set(selectedShopAtom, selectedShop);

    expect(JSON.parse(localStorage.getItem("selected-shop") ?? "null")).toEqual({
      schemaVersion: 3,
      selectedShop,
    });
  });

  it("別タブの前回店舗更新で実行中の店舗contextを上書きしない", async () => {
    const currentShop = {
      shopId: "shop-current",
      shopName: "現在の店舗",
      organizationId: "organization-current",
      organizationName: "現在のグループ",
      organizationPlan: "pro" as const,
    };
    const otherTabShop = {
      ...currentShop,
      shopId: "shop-other-tab",
      shopName: "別タブの店舗",
    };
    localStorage.setItem("selected-shop", JSON.stringify({ schemaVersion: 3, selectedShop: currentShop }));

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

  it("旧storage schema v2の店舗を現行店舗として復元しない", async () => {
    localStorage.setItem(
      "selected-shop",
      JSON.stringify({
        schemaVersion: 2,
        selectedShop: {
          shopId: "shop-archived",
          shopName: "旧アーカイブ店舗",
          shopStatus: "archived",
          organizationId: "organization-current",
          organizationName: "現在のグループ",
          organizationPlan: "pro",
        },
      }),
    );

    const [{ createStore }, { selectedShopAtom }] = await Promise.all([import("jotai"), import(".")]);

    expect(createStore().get(selectedShopAtom)).toBeNull();
  });
});
