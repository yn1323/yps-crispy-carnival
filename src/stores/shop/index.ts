import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { normalizeSelectedShop, type SelectedShopType } from "@/src/domains/shop/context";

const rawStorage = createJSONStorage<unknown>();
type SelectedShopStorageEnvelope = {
  schemaVersion: 2;
  selectedShop: SelectedShopType;
};

const selectedShopStorage = {
  getItem: (key: string, initialValue: SelectedShopType) => {
    const stored = rawStorage.getItem(key, initialValue);
    if (isSelectedShopStorageEnvelope(stored)) return normalizeSelectedShop(stored.selectedShop);
    return normalizeLegacySelectedShop(stored);
  },
  setItem: (key: string, value: SelectedShopType) =>
    rawStorage.setItem(key, {
      schemaVersion: 2,
      selectedShop: value,
    } satisfies SelectedShopStorageEnvelope),
  removeItem: (key: string) => rawStorage.removeItem(key),
};

function isSelectedShopStorageEnvelope(value: unknown): value is SelectedShopStorageEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === 2 &&
    "selectedShop" in value
  );
}

function normalizeLegacySelectedShop(value: unknown): SelectedShopType {
  if (typeof value !== "object" || value === null || !("organizationPlan" in value)) {
    return normalizeSelectedShop(value);
  }
  const legacyPlan = value.organizationPlan;
  return normalizeSelectedShop({
    ...value,
    organizationPlan: legacyPlan === "pro" ? "standard" : legacyPlan === "business" ? "pro" : legacyPlan,
  });
}

// localStorage永続化。URL未指定時のfallbackに使うため、同期storageの前回値を初回renderから読む。
// URLはタブ単位の正なので、他タブのstorage eventは購読せず実行中contextを上書きしない。
// 旧DTOは初回読込時に不足fieldを補い、旧pro / businessをcanonical IDへ正規化する。
export const selectedShopAtom = atomWithStorage<SelectedShopType>("selected-shop", null, selectedShopStorage, {
  getOnInit: true,
});

// 派生atom: 店舗選択済みかどうか
export const hasSelectedShopAtom = atom((get) => get(selectedShopAtom) !== null);
