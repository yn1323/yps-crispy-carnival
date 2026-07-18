export type SettingsSearchTab = "people" | "shops" | "billing" | "settings";

export function normalizeShopSearch<T extends Record<string, unknown>>(previous: T, shopId: string) {
  return { ...previous, shop: shopId };
}

export function clearRequestedShopSearch() {
  return { shop: undefined };
}

export function updateSettingsTabSearch<T extends Record<string, unknown>>(previous: T, tab: SettingsSearchTab) {
  return { ...previous, tab: tab === "people" ? undefined : tab };
}
