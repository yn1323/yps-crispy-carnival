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
} from "@/src/domains/shop/context";
import { selectedShopAtom } from "@/src/stores/shop";
import { featureVisibilityAtom } from "@/src/stores/user";
import type { PlanStatusCardProps } from "../PlanStatusCard";
import { buildOperationContextModel } from "./script";
import { OperationContextSkeleton, OperationContextView } from "./View";

export type { OperationContextModel } from "./script";
export { buildOperationContextModel } from "./script";
export { OperationContextSkeleton, OperationContextView } from "./View";

export type OperationContextData = {
  shops: readonly ShopContextOption[];
  selectedShop: NonNullable<SelectedShopType>;
  organizations?: readonly OperationContextOrganizationOption[];
  onOrganizationSelect?: (organization: OperationContextOrganizationOption) => void;
  onSelect?: (shop: ShopContextOption) => void;
};

export type OperationContextOrganizationOption = {
  id: string;
  name: string;
};

type Props = {
  data?: OperationContextData;
  planStatusCard?: PlanStatusCardProps | null;
  billingSettingsShopId?: string;
  onOpenShopDetail?: (shopId: string) => void;
  onOpenOrganizationSettings?: () => void;
};

export const OperationContext = ({
  data,
  planStatusCard,
  billingSettingsShopId,
  onOpenShopDetail,
  onOpenOrganizationSettings,
}: Props) => {
  const navigate = useNavigate();
  const rawShops = useQuery(api.dashboard.queries.getMyShops, data ? "skip" : {});
  const storedSelectedShop = useAtomValue(selectedShopAtom);
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const showOrganizationSettings = featureVisibility.organizationSettingsNavigation;
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

  const organizationChangeOptions =
    data?.organizations && data.onOrganizationSelect
      ? data.organizations
          .filter((organization) => organization.id !== model.selectedGroup.key)
          .map((organization) => ({
            key: organization.id,
            organizationName: organization.name,
            targetId: organization.id,
          }))
      : undefined;

  const selectShop = (shop: ShopContextOption) => {
    if (data?.onSelect) {
      data.onSelect(shop);
      return;
    }

    void navigate({ to: "/dashboard", search: { shop: shop.shopId } });
  };

  const handleShopSelect = (shopId: string) => {
    const nextShop = model.groups.flatMap((group) => group.shops).find((shop) => shop.shopId === shopId);
    if (nextShop && nextShop.shopId !== model.selectedShop.shopId) selectShop(nextShop);
  };

  const handleOpenShopDetail = () => {
    if (onOpenShopDetail) {
      onOpenShopDetail(model.selectedShop.shopId);
      return;
    }
    void navigate({
      to: "/shops/$shopId",
      params: { shopId: model.selectedShop.shopId },
      search: { shop: model.selectedShop.shopId, returnTo: "dashboard" },
    });
  };

  return (
    <OperationContextView
      key={billingSettingsShopId ?? model.selectedShop.shopId}
      model={model}
      onShopSelect={handleShopSelect}
      onOpenShopDetail={handleOpenShopDetail}
      organizationSettingsShopId={showOrganizationSettings ? model.selectedShop.shopId : undefined}
      onOpenOrganizationSettings={onOpenOrganizationSettings}
      organizationChangeOptions={organizationChangeOptions}
      onOrganizationChange={
        data?.onOrganizationSelect
          ? (organizationId) => {
              const organization = data.organizations?.find((candidate) => candidate.id === organizationId);
              if (organization) data.onOrganizationSelect?.(organization);
            }
          : undefined
      }
      planStatusCard={planStatusCard}
      billingSettingsShopId={billingSettingsShopId}
    />
  );
};
