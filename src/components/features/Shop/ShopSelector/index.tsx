import { Select, type SelectItemType } from "@/src/components/ui/Select";

type Shop = {
  _id: string;
  shopName: string;
};

type ShopSelectorProps = {
  shops: Shop[];
  selectedShopId: string | null;
  onShopChange: (shop: { shopId: string; shopName: string }) => void;
  isLoading?: boolean;
  usePortal?: boolean;
};

export const ShopSelector = ({
  shops,
  selectedShopId,
  onShopChange,
  isLoading = false,
  usePortal = true,
}: ShopSelectorProps) => {
  // shops を SelectItemType[] に変換
  const items: SelectItemType[] = shops.map((shop) => ({
    value: shop._id,
    label: shop.shopName,
  }));

  const handleChange = (value: string) => {
    const shop = shops.find((s) => s._id === value);
    if (shop) {
      onShopChange({ shopId: shop._id, shopName: shop.shopName });
    }
  };

  if (isLoading) {
    return <Select items={[]} onChange={() => {}} placeholder="読み込み中..." disabled />;
  }

  return (
    <Select
      items={items}
      value={selectedShopId ?? undefined}
      onChange={handleChange}
      placeholder="店舗を選択"
      w="100%"
      usePortal={usePortal}
    />
  );
};
