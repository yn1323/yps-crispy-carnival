import type { ShopContextOption } from "@/src/domains/shop/context";

export type AppHomeShopOption = {
  id: string;
  name: string;
};

export const APP_HOME_SHOP_PREFERENCE_STORAGE_KEY = "shiftori-app-home-shop-preferences:v1";

export type AppHomeShopResolution =
  | { kind: "loading" }
  | { kind: "empty" }
  | {
      kind: "ready";
      shop: AppHomeShopOption;
      canonicalShopId: string;
      shouldReplaceSearch: boolean;
    };

/**
 * Homeが表示する1店舗をcanonical organization queryの結果から確定する。
 * 保存値は候補内に存在するときだけ利用するclient hintであり、認可には使わない。
 */
export function resolveAppHomeShop(
  activeShops: readonly AppHomeShopOption[] | null,
  requestedShopId?: string,
  preferredShopId?: string,
): AppHomeShopResolution {
  if (activeShops === null) return { kind: "loading" };
  if (activeShops.length === 0) return { kind: "empty" };

  const requestedShop = requestedShopId ? activeShops.find((shop) => shop.id === requestedShopId) : undefined;
  const preferredShop = preferredShopId ? activeShops.find((shop) => shop.id === preferredShopId) : undefined;
  const shop = requestedShop ?? preferredShop ?? activeShops[0];

  return {
    kind: "ready",
    shop,
    canonicalShopId: shop.id,
    shouldReplaceSearch: requestedShopId !== shop.id,
  };
}

export function readAppHomeShopPreference(
  storage: Pick<Storage, "getItem"> | null | undefined,
  organizationId: string,
): string | undefined {
  if (!storage) return undefined;
  try {
    return parseAppHomeShopPreferences(storage.getItem(APP_HOME_SHOP_PREFERENCE_STORAGE_KEY))[organizationId];
  } catch {
    return undefined;
  }
}

export function writeAppHomeShopPreference(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  organizationId: string,
  shopId: string,
): boolean {
  if (!storage) return false;
  try {
    const preferences = parseAppHomeShopPreferences(storage.getItem(APP_HOME_SHOP_PREFERENCE_STORAGE_KEY));
    preferences[organizationId] = shopId;
    storage.setItem(APP_HOME_SHOP_PREFERENCE_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

function parseAppHomeShopPreferences(rawValue: string | null): Record<string, string> {
  if (!rawValue) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 &&
        entry[0].length <= 256 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0 &&
        entry[1].length <= 256,
    ),
  );
}

export function buildAppHomeShopContexts(
  activeShops: readonly AppHomeShopOption[],
  organization: {
    id: string;
    name: string;
    memberStatus: "active" | "readOnly";
  },
): ShopContextOption[] {
  return activeShops.map((shop) => ({
    shopId: shop.id,
    shopName: shop.name,
    shopStatus: "active",
    organizationId: organization.id,
    organizationName: organization.name,
    organizationPlan: null,
    memberStatus: organization.memberStatus,
  }));
}
