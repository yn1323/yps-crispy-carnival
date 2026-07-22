import { describe, expect, it } from "vitest";
import type { SelectedShopType, ShopContextOption } from "@/src/domains/shop/context";
import { resolveShopContext } from "./shopContextResolver";

const shops: ShopContextOption[] = [
  {
    shopId: "shop-a",
    shopName: "A店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "A社",
    organizationPlan: "free",
    memberStatus: "active",
  },
  {
    shopId: "shop-b",
    shopName: "B店",
    shopStatus: "active",
    organizationId: "organization-b",
    organizationName: "B社",
    organizationPlan: "pro",
    memberStatus: "active",
  },
];

const storedShop = (shop: ShopContextOption): NonNullable<SelectedShopType> => ({ ...shop });

describe("resolveShopContext", () => {
  it("URLの店舗が候補にあれば保存値より優先する", () => {
    expect(
      resolveShopContext({
        requestedShopId: "shop-b",
        selectedShop: storedShop(shops[0]),
        shops,
      }),
    ).toEqual({
      kind: "resolved",
      shop: shops[1],
      source: "url",
      shouldNormalizeUrl: false,
    });
  });

  it("URLの店舗が候補外なら保存値へfallbackしない", () => {
    expect(
      resolveShopContext({
        requestedShopId: "unknown-shop",
        selectedShop: storedShop(shops[0]),
        shops,
      }),
    ).toEqual({ kind: "invalidRequestedShop" });
  });

  it("URLがなければ候補に残っている保存済み店舗を使う", () => {
    expect(resolveShopContext({ selectedShop: storedShop(shops[1]), shops })).toEqual({
      kind: "resolved",
      shop: shops[1],
      source: "storage",
      shouldNormalizeUrl: true,
    });
  });

  it("URLも有効な保存値もなければ候補数に関係なく先頭を使う", () => {
    const unavailableStoredShop = storedShop({ ...shops[1], shopId: "removed-shop" });

    expect(resolveShopContext({ selectedShop: unavailableStoredShop, shops })).toEqual({
      kind: "resolved",
      shop: shops[0],
      source: "firstCandidate",
      shouldNormalizeUrl: true,
    });
  });

  it("URLがなく候補もなければ空状態にする", () => {
    expect(resolveShopContext({ selectedShop: storedShop(shops[0]), shops: [] })).toEqual({ kind: "empty" });
  });
});
