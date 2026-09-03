import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { normalizeSelectedShop, type SelectedShopType } from "@/src/domains/shop/context";

const rawStorage = createJSONStorage<unknown>();
type SelectedShopStorageEnvelope = {
  schemaVersion: 3;
  selectedShop: SelectedShopType;
};

const selectedShopStorage = {
  getItem: (key: string, initialValue: SelectedShopType) => {
    const stored = rawStorage.getItem(key, initialValue);
    if (isSelectedShopStorageEnvelope(stored)) return normalizeSelectedShop(stored.selectedShop);
    return null;
  },
  setItem: (key: string, value: SelectedShopType) =>
    rawStorage.setItem(key, {
      schemaVersion: 3,
      selectedShop: value,
    } satisfies SelectedShopStorageEnvelope),
  removeItem: (key: string) => rawStorage.removeItem(key),
};

function isSelectedShopStorageEnvelope(value: unknown): value is SelectedShopStorageEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === 3 &&
    "selectedShop" in value
  );
}

// localStorage永続化。URL未指定時のfallbackに使うため、同期storageの前回値を初回renderから読む。
// URLはタブ単位の正なので、他タブのstorage eventは購読せず実行中contextを上書きしない。
export const selectedShopAtom = atomWithStorage<SelectedShopType>("selected-shop", null, selectedShopStorage, {
  getOnInit: true,
});

// 派生atom: 店舗選択済みかどうか
export const hasSelectedShopAtom = atom((get) => get(selectedShopAtom) !== null);
