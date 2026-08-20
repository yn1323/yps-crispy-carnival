import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveAppFeatureRequestScope } from "./featureRequestScope";

const shops = [
  { id: "shop-a" as Id<"shops">, name: "A店" },
  { id: "shop-b" as Id<"shops">, name: "B店" },
];

describe("resolveAppFeatureRequestScope", () => {
  it("Homeのshopがactive組織店舗なら既定店舗にする", () => {
    expect(resolveAppFeatureRequestScope({ pathname: "/dashboard", homeShopId: "shop-b", activeShops: shops })).toEqual(
      {
        kind: "shop",
        shop: shops[1],
      },
    );
    expect(
      resolveAppFeatureRequestScope({ pathname: "/dashboard/", homeShopId: "shop-b", activeShops: shops }),
    ).toEqual({
      kind: "shop",
      shop: shops[1],
    });
  });

  it("組織外または無効なHome店舗を既定にせず、組織scopeへ戻す", () => {
    expect(
      resolveAppFeatureRequestScope({ pathname: "/dashboard", homeShopId: "other-shop", activeShops: shops }),
    ).toEqual({ kind: "organization" });
  });

  it("店舗詳細はroute paramとactive店舗の一致を内部送信先にする", () => {
    expect(resolveAppFeatureRequestScope({ pathname: "/manage/shops/shop-a", activeShops: shops })).toEqual({
      kind: "shop",
      shop: shops[0],
    });
    expect(resolveAppFeatureRequestScope({ pathname: "/manage/shops/shop-a/", activeShops: shops })).toEqual({
      kind: "shop",
      shop: shops[0],
    });
    expect(resolveAppFeatureRequestScope({ pathname: "/Manage/Shops/shop-a/", activeShops: shops })).toEqual({
      kind: "shop",
      shop: shops[0],
    });
    expect(
      resolveAppFeatureRequestScope({
        pathname: "/staff/person-a/shops/shop-b",
        activeShops: shops,
      }),
    ).toEqual({
      kind: "shop",
      shop: shops[1],
    });
    expect(resolveAppFeatureRequestScope({ pathname: "/shifts", activeShops: shops })).toEqual({
      kind: "organization",
    });
  });

  it("店舗詳細でもroute paramがactive組織店舗でなければ組織scopeへ戻す", () => {
    expect(
      resolveAppFeatureRequestScope({
        pathname: "/staff/person-a/shops/foreign-shop",
        activeShops: shops,
      }),
    ).toEqual({ kind: "organization" });
  });

  it.each(["/staff/register", "/shifts/submit"])("公開route %s は店舗scopeとして扱わない", (pathname) => {
    expect(resolveAppFeatureRequestScope({ pathname, activeShops: shops })).toEqual({ kind: "organization" });
  });

  it.each(["/staff/register/", "/Staff/Register/", "/shifts/submit/", "/Shifts/Submit/"])(
    "公開route %s のslash URLも店舗scopeとして扱わない",
    (pathname) => {
      expect(resolveAppFeatureRequestScope({ pathname, activeShops: shops })).toEqual({ kind: "organization" });
    },
  );
});
