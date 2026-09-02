export type ShopFilterResolution<TShopId extends string> =
  | { kind: "loading" }
  | { kind: "ready"; shopFilter: "all" | TShopId; shouldReplaceSearch: boolean };

export function resolveShopFilter<TShopId extends string>(
  shops: readonly { id: TShopId }[] | null,
  requestedShopFilter?: string,
): ShopFilterResolution<TShopId> {
  if (shops === null) return { kind: "loading" };
  if (!requestedShopFilter) return { kind: "ready", shopFilter: "all", shouldReplaceSearch: false };

  const shop = shops.find((candidate) => candidate.id === requestedShopFilter);
  if (!shop) return { kind: "ready", shopFilter: "all", shouldReplaceSearch: true };

  return { kind: "ready", shopFilter: shop.id, shouldReplaceSearch: false };
}
