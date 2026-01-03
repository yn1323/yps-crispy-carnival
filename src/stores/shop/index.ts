import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type SelectedShopType = {
  shopId: string;
  shopName: string;
} | null;

// localStorage永続化（リロード後も店舗選択を維持）
export const selectedShopAtom = atomWithStorage<SelectedShopType>("selected-shop", null);

// 派生atom: 店舗選択済みかどうか
export const hasSelectedShopAtom = atom((get) => get(selectedShopAtom) !== null);
