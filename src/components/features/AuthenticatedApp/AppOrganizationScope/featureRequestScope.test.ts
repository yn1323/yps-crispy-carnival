import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveAppFeatureRequestScope } from "./featureRequestScope";

const shops = [
  { id: "shop-a" as Id<"shops">, name: "A店" },
  { id: "shop-b" as Id<"shops">, name: "B店" },
];

describe("resolveAppFeatureRequestScope", () => {
  it("Homeのshopがactive組織店舗なら既定店舗にする", () => {
    expect(resolveAppFeatureRequestScope({ pathname: "/app/home", homeShopId: "shop-b", activeShops: shops })).toEqual({
      kind: "shop",
      shop: shops[1],
    });
  });

  it("組織外または無効なHome店舗を既定にせず、組織scopeへ戻す", () => {
    expect(
      resolveAppFeatureRequestScope({ pathname: "/app/home", homeShopId: "other-shop", activeShops: shops }),
    ).toEqual({ kind: "organization" });
  });

  it("店舗詳細はroute paramとactive店舗の一致を内部送信先にする", () => {
    expect(resolveAppFeatureRequestScope({ pathname: "/app/manage/shops/shop-a", activeShops: shops })).toEqual({
      kind: "shop",
      shop: shops[0],
    });
    expect(
      resolveAppFeatureRequestScope({
        pathname: "/app/staff/person-a/shops/shop-b",
        activeShops: shops,
      }),
    ).toEqual({
      kind: "shop",
      shop: shops[1],
    });
    expect(resolveAppFeatureRequestScope({ pathname: "/app/shifts", activeShops: shops })).toEqual({
      kind: "organization",
    });
  });

  it("店舗詳細でもroute paramがactive組織店舗でなければ組織scopeへ戻す", () => {
    expect(
      resolveAppFeatureRequestScope({
        pathname: "/app/staff/person-a/shops/foreign-shop",
        activeShops: shops,
      }),
    ).toEqual({ kind: "organization" });
  });
});
