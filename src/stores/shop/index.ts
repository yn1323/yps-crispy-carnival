import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";

export type ShopStatus = "active" | "archived" | "planSuspended";
export type OrganizationMemberStatus = "active" | "readOnly" | "removed";
export type OrganizationPlan = "trial" | "free" | "pro" | "business";

export type ShopContextOption = {
  shopId: string;
  shopName: string;
  shopStatus: ShopStatus;
  organizationId: string | null;
  organizationName: string | null;
  organizationPlan: OrganizationPlan | null;
  memberStatus: OrganizationMemberStatus;
};

export type SelectedShopType = {
  shopId: string;
  shopName: string;
  shopStatus: ShopStatus;
  organizationId: string | null;
  organizationName: string | null;
  organizationPlan: OrganizationPlan | null;
  memberStatus: OrganizationMemberStatus;
} | null;

const rawStorage = createJSONStorage<unknown>();
const selectedShopStorage = {
  getItem: (key: string, initialValue: SelectedShopType) =>
    normalizeSelectedShop(rawStorage.getItem(key, initialValue)),
  setItem: (key: string, value: SelectedShopType) => rawStorage.setItem(key, value),
  removeItem: (key: string) => rawStorage.removeItem(key),
  subscribe: rawStorage.subscribe
    ? (key: string, callback: (value: SelectedShopType) => void, initialValue: SelectedShopType) =>
        rawStorage.subscribe?.(key, (value) => callback(normalizeSelectedShop(value)), initialValue)
    : undefined,
};

// localStorage永続化。旧DTOは初回読込時に不足fieldを安全な既定値で補い、query結果で正規化する。
export const selectedShopAtom = atomWithStorage<SelectedShopType>("selected-shop", null, selectedShopStorage);

// 派生atom: 店舗選択済みかどうか
export const hasSelectedShopAtom = atom((get) => get(selectedShopAtom) !== null);

export function normalizeShopContextOption(value: unknown): ShopContextOption | null {
  if (!isRecord(value) || typeof value.shopId !== "string" || typeof value.shopName !== "string") {
    return null;
  }

  return {
    shopId: value.shopId,
    shopName: value.shopName,
    shopStatus: isShopStatus(value.shopStatus) ? value.shopStatus : "active",
    organizationId: typeof value.organizationId === "string" ? value.organizationId : null,
    organizationName: typeof value.organizationName === "string" ? value.organizationName : null,
    organizationPlan: isOrganizationPlan(value.organizationPlan) ? value.organizationPlan : null,
    memberStatus: isOrganizationMemberStatus(value.memberStatus) ? value.memberStatus : "active",
  };
}

export function normalizeShopContextOptions(values: readonly unknown[]): ShopContextOption[] {
  return values.flatMap((value) => {
    const normalized = normalizeShopContextOption(value);
    return normalized ? [normalized] : [];
  });
}

export function normalizeSelectedShop(value: unknown): SelectedShopType {
  return normalizeShopContextOption(value);
}

export function toSelectedShop(shop: ShopContextOption): NonNullable<SelectedShopType> {
  return { ...shop };
}

export function isSelectableShop(shop: ShopContextOption): boolean {
  // archived / planSuspended は既存データと事業者設定を読むための選択肢として残す。
  // 書き込み可否はConvex側が店舗状態と管理者所属を再検証する。
  return shop.memberStatus !== "removed";
}

export function isSameSelectedShop(
  selectedShop: SelectedShopType,
  shop: ShopContextOption,
): selectedShop is NonNullable<SelectedShopType> {
  return (
    selectedShop !== null &&
    selectedShop.shopId === shop.shopId &&
    selectedShop.shopName === shop.shopName &&
    selectedShop.shopStatus === shop.shopStatus &&
    selectedShop.organizationId === shop.organizationId &&
    selectedShop.organizationName === shop.organizationName &&
    selectedShop.organizationPlan === shop.organizationPlan &&
    selectedShop.memberStatus === shop.memberStatus
  );
}

export type ShopOrganizationGroup = {
  key: string;
  organizationName: string;
  shops: ShopContextOption[];
};

export function groupShopsByOrganization(shops: readonly ShopContextOption[]): ShopOrganizationGroup[] {
  const groups = new Map<string, ShopOrganizationGroup>();

  for (const shop of shops) {
    const organizationName = shop.organizationName ?? "所属事業者";
    const key = shop.organizationId ?? `name:${organizationName}`;
    const group = groups.get(key) ?? { key, organizationName, shops: [] };
    group.shops.push(shop);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      shops: [...group.shops].sort((a, b) => a.shopName.localeCompare(b.shopName, "ja")),
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName, "ja"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShopStatus(value: unknown): value is ShopStatus {
  return value === "active" || value === "archived" || value === "planSuspended";
}

function isOrganizationMemberStatus(value: unknown): value is OrganizationMemberStatus {
  return value === "active" || value === "readOnly" || value === "removed";
}

function isOrganizationPlan(value: unknown): value is OrganizationPlan {
  return value === "trial" || value === "free" || value === "pro" || value === "business";
}
