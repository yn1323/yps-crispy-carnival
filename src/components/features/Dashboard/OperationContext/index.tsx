import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import {
  isSelectableShop,
  normalizeShopContextOptions,
  type SelectedShopType,
  type ShopContextOption,
  selectedShopAtom,
} from "@/src/stores/shop";
import { buildOperationContextModel, getShopForGroupSelection } from "./script";
import { OperationContextSkeleton, OperationContextView } from "./View";

export { OperationContextSkeleton, OperationContextView } from "./View";

export type OperationContextData = {
  shops: readonly ShopContextOption[];
  selectedShop: NonNullable<SelectedShopType>;
  onSelect?: (shop: ShopContextOption) => void;
};

type Props = {
  isReadOnly?: boolean;
  onOpenShopSettings: () => void;
  data?: OperationContextData;
};

export const OperationContext = ({ isReadOnly = false, onOpenShopSettings, data }: Props) => {
  const navigate = useNavigate();
  const rawShops = useQuery(api.dashboard.queries.getMyShops, data ? "skip" : {});
  const storedSelectedShop = useAtomValue(selectedShopAtom);
  const shops = useMemo(
    () => data?.shops ?? normalizeShopContextOptions(rawShops ?? []).filter(isSelectableShop),
    [data?.shops, rawShops],
  );
  const selectedShop = data?.selectedShop ?? storedSelectedShop;
  const model = useMemo(
    () => buildOperationContextModel(shops, selectedShop?.shopId ?? null),
    [selectedShop?.shopId, shops],
  );

  if (!data && rawShops === undefined) return <OperationContextSkeleton />;
  if (!model) return null;

  const selectShop = (shop: ShopContextOption) => {
    if (data?.onSelect) {
      data.onSelect(shop);
      return;
    }

    void navigate({ to: "/dashboard", search: { shop: shop.shopId } });
  };

  const handleGroupSelect = (groupKey: string) => {
    const nextShop = getShopForGroupSelection(model.groups, groupKey, model.selectedShop.shopId);
    if (nextShop && nextShop.shopId !== model.selectedShop.shopId) selectShop(nextShop);
  };

  const handleShopSelect = (shopId: string) => {
    const nextShop = model.selectedGroup.shops.find((shop) => shop.shopId === shopId);
    if (nextShop && nextShop.shopId !== model.selectedShop.shopId) selectShop(nextShop);
  };

  return (
    <OperationContextView
      model={model}
      isReadOnly={isReadOnly}
      groupSettingsShopId={model.selectedShop.shopId}
      onGroupSelect={handleGroupSelect}
      onShopSelect={handleShopSelect}
      onOpenShopSettings={onOpenShopSettings}
    />
  );
};
