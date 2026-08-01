import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { normalizeSelectedShop, type SelectedShopType } from "@/src/domains/shop/context";

const rawStorage = createJSONStorage<unknown>();
const selectedShopStorage = {
  getItem: (key: string, initialValue: SelectedShopType) =>
    normalizeSelectedShop(rawStorage.getItem(key, initialValue)),
  setItem: (key: string, value: SelectedShopType) => rawStorage.setItem(key, value),
  removeItem: (key: string) => rawStorage.removeItem(key),
};

// localStorage永続化。URL未指定時のfallbackに使うため、同期storageの前回値を初回renderから読む。
// URLはタブ単位の正なので、他タブのstorage eventは購読せず実行中contextを上書きしない。
// 旧DTOは初回読込時に不足fieldを安全な既定値で補い、query結果で正規化する。
export const selectedShopAtom = atomWithStorage<SelectedShopType>("selected-shop", null, selectedShopStorage, {
  getOnInit: true,
});

// 派生atom: 店舗選択済みかどうか
export const hasSelectedShopAtom = atom((get) => get(selectedShopAtom) !== null);
