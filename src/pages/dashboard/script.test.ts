import { describe, expect, it } from "vitest";
import {
  buildDashboardShopContexts,
  DASHBOARD_SHOP_PREFERENCE_STORAGE_KEY,
  readDashboardShopPreference,
  resolveDashboardShop,
  writeDashboardShopPreference,
} from "./script";

const SHOPS = [
  { id: "shop-a", name: "A店舗" },
  { id: "shop-b", name: "B店舗" },
] as const;

describe("resolveDashboardShop", () => {
  it("全cursorの読込中は店舗を確定しない", () => {
    expect(resolveDashboardShop(null, "shop-a")).toEqual({ kind: "loading" });
  });

  it("利用できるactive店舗がなければemptyを返す", () => {
    expect(resolveDashboardShop([], undefined)).toEqual({ kind: "empty" });
  });

  it("URLの店舗が現在の組織に存在すればその店舗を維持する", () => {
    expect(resolveDashboardShop(SHOPS, "shop-b", "shop-a")).toEqual({
      kind: "ready",
      shop: SHOPS[1],
      canonicalShopId: "shop-b",
      shouldReplaceSearch: false,
    });
  });

  it("URLが未指定なら現在組織のactive店舗に含まれる保存hintを復元する", () => {
    expect(resolveDashboardShop(SHOPS, undefined, "shop-b")).toEqual({
      kind: "ready",
      shop: SHOPS[1],
      canonicalShopId: "shop-b",
      shouldReplaceSearch: true,
    });
  });

  it("保存hintが別組織の店舗ならcanonicalな先頭店舗へ戻す", () => {
    expect(resolveDashboardShop(SHOPS, undefined, "another-organization-shop")).toEqual({
      kind: "ready",
      shop: SHOPS[0],
      canonicalShopId: "shop-a",
      shouldReplaceSearch: true,
    });
  });

  it.each([undefined, "another-organization-shop"])(
    "店舗が未指定または候補外ならcanonicalな先頭店舗へreplaceする: %s",
    (requestedShopId) => {
      expect(resolveDashboardShop(SHOPS, requestedShopId)).toEqual({
        kind: "ready",
        shop: SHOPS[0],
        canonicalShopId: "shop-a",
        shouldReplaceSearch: true,
      });
    },
  );
});

describe("Home店舗の組織別client hint", () => {
  it("version付きapp専用keyへorg/shop IDだけを保存し、組織ごとに復元する", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(writeDashboardShopPreference(storage, "organization-a", "shop-a")).toBe(true);
    expect(writeDashboardShopPreference(storage, "organization-b", "shop-b")).toBe(true);

    expect(readDashboardShopPreference(storage, "organization-a")).toBe("shop-a");
    expect(readDashboardShopPreference(storage, "organization-b")).toBe("shop-b");
    expect(JSON.parse(values.get(DASHBOARD_SHOP_PREFERENCE_STORAGE_KEY) ?? "null")).toEqual({
      "organization-a": "shop-a",
      "organization-b": "shop-b",
    });
  });

  it("browser storageが壊れている、存在しない、例外を返す場合もfail-softにする", () => {
    const invalidStorage = { getItem: () => "not-json", setItem: () => undefined };
    const throwingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readDashboardShopPreference(null, "organization-a")).toBeUndefined();
    expect(readDashboardShopPreference(invalidStorage, "organization-a")).toBeUndefined();
    expect(readDashboardShopPreference(throwingStorage, "organization-a")).toBeUndefined();
    expect(writeDashboardShopPreference(throwingStorage, "organization-a", "shop-a")).toBe(false);
  });
});

describe("buildDashboardShopContexts", () => {
  it("canonical organizationの非削除店舗を既存Dashboardの店舗contextへ変換する", () => {
    expect(
      buildDashboardShopContexts(SHOPS, {
        id: "organization-a",
        name: "Aグループ",
        plan: "standard",
      }),
    ).toEqual([
      {
        shopId: "shop-a",
        shopName: "A店舗",
        organizationId: "organization-a",
        organizationName: "Aグループ",
        organizationPlan: "standard",
      },
      {
        shopId: "shop-b",
        shopName: "B店舗",
        organizationId: "organization-a",
        organizationName: "Aグループ",
        organizationPlan: "standard",
      },
    ]);
  });
});
