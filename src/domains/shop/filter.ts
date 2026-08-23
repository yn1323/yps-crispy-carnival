export type ShopFilterResolution<TShopId extends string> =
  | { kind: "loading" }
  | { kind: "ready"; shopFilter: "all" | TShopId; shouldReplaceSearch: boolean };

export function resolveShopFilter<TShopId extends string>(
  activeShops: readonly { id: TShopId }[] | null,
  requestedShopFilter?: string,
): ShopFilterResolution<TShopId> {
  if (activeShops === null) return { kind: "loading" };
  if (!requestedShopFilter) return { kind: "ready", shopFilter: "all", shouldReplaceSearch: false };

  const shop = activeShops.find((candidate) => candidate.id === requestedShopFilter);
  if (!shop) return { kind: "ready", shopFilter: "all", shouldReplaceSearch: true };

  return { kind: "ready", shopFilter: shop.id, shouldReplaceSearch: false };
}
