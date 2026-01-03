import { useAtom } from "jotai";
import { useEffect } from "react";
import { selectedShopAtom } from "@/src/stores/shop";

type Shop = {
  _id: string;
  shopName: string;
};

export const useInitializeShop = (shops: Shop[] | undefined) => {
  const [selectedShop, setSelectedShop] = useAtom(selectedShopAtom);

  useEffect(() => {
    if (!shops) return; // ローディング中

    // 店舗0件: null維持
    if (shops.length === 0) {
      setSelectedShop(null);
      return;
    }

    // localStorageから復元済み & 有効な店舗 → そのまま
    if (selectedShop) {
      const isValid = shops.some((shop) => shop._id === selectedShop.shopId);
      if (isValid) return;
    }

    // 新規選択: 最初の店舗を自動選択
    const firstShop = shops[0];
    setSelectedShop({
      shopId: firstShop._id,
      shopName: firstShop.shopName,
    });
  }, [shops, selectedShop, setSelectedShop]);

  return { selectedShop, setSelectedShop };
};
