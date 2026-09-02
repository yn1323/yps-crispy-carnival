import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { normalizeShopContextOptions, type SelectedShopType, type ShopContextOption } from "@/src/domains/shop/context";
import { selectedShopAtom } from "@/src/stores/shop";
import { buildOperationContextModel } from "./script";
import { OperationContextSkeleton, OperationContextView } from "./View";

export type { OperationContextModel } from "./script";
export { buildOperationContextModel } from "./script";
export { OperationContextSkeleton, OperationContextView } from "./View";

export type OperationContextData = {
  shops: readonly ShopContextOption[];
  selectedShop: NonNullable<SelectedShopType>;
  onSelect?: (shop: ShopContextOption) => void;
};

type Props = {
  data?: OperationContextData;
  onOpenShopDetail?: (shopId: string) => void;
};

export const OperationContext = ({ data, onOpenShopDetail }: Props) => {
  const rawShops = useQuery(api.dashboard.queries.getMyShops, data ? "skip" : {});
  const storedSelectedShop = useAtomValue(selectedShopAtom);
  const shops = useMemo(() => data?.shops ?? normalizeShopContextOptions(rawShops ?? []), [data?.shops, rawShops]);
  const selectedShop = data?.selectedShop ?? storedSelectedShop;
  const model = useMemo(
    () => buildOperationContextModel(shops, selectedShop?.shopId ?? null),
    [selectedShop?.shopId, shops],
  );

  if (!data && rawShops === undefined) return <OperationContextSkeleton />;
  if (!model) return null;

  const selectShop = (shop: ShopContextOption) => {
    data?.onSelect?.(shop);
  };

  const handleShopSelect = (shopId: string) => {
    const nextShop = model.selectedGroup.shops.find((shop) => shop.shopId === shopId);
    if (nextShop && nextShop.shopId !== model.selectedShop.shopId) selectShop(nextShop);
  };

  const handleOpenShopDetail = () => {
    onOpenShopDetail?.(model.selectedShop.shopId);
  };

  return (
    <OperationContextView
      key={model.selectedShop.shopId}
      model={model}
      onShopSelect={handleShopSelect}
      onOpenShopDetail={handleOpenShopDetail}
    />
  );
};
