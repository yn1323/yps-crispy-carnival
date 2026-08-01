import type { SelectedShopType, ShopContextOption } from "@/src/domains/shop/context";

type ResolveShopContextArgs = {
  requestedShopId?: string;
  selectedShop: SelectedShopType;
  shops: readonly ShopContextOption[];
};

export type ShopContextResolution =
  | { kind: "empty" }
  | { kind: "invalidRequestedShop" }
  | {
      kind: "resolved";
      shop: ShopContextOption;
      source: "url" | "storage" | "firstCandidate";
      shouldNormalizeUrl: boolean;
    };

/**
 * URLに明示された店舗は、APIが返した候補に一致する場合だけ採用する。
 * URLがない場合に限り、保存済み店舗、API候補の先頭の順で補完する。
 */
export function resolveShopContext({
  requestedShopId,
  selectedShop,
  shops,
}: ResolveShopContextArgs): ShopContextResolution {
  if (requestedShopId !== undefined) {
    const requestedShop = shops.find((shop) => shop.shopId === requestedShopId);
    return requestedShop
      ? {
          kind: "resolved",
          shop: requestedShop,
          source: "url",
          shouldNormalizeUrl: false,
        }
      : { kind: "invalidRequestedShop" };
  }

  const storedShop = selectedShop ? shops.find((shop) => shop.shopId === selectedShop.shopId) : undefined;
  if (storedShop) {
    return {
      kind: "resolved",
      shop: storedShop,
      source: "storage",
      shouldNormalizeUrl: true,
    };
  }

  const firstCandidate = shops[0];
  if (!firstCandidate) return { kind: "empty" };

  return {
    kind: "resolved",
    shop: firstCandidate,
    source: "firstCandidate",
    shouldNormalizeUrl: true,
  };
}
