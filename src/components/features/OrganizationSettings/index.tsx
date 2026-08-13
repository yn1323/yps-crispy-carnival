import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { normalizeOrganizationSettingsFeatures } from "@/src/domains/featureVisibility";
import { groupShopsByOrganization, type ShopContextOption } from "@/src/domains/shop/context";
import { toUserListCountSearch } from "@/src/lib/userListSearch";
import { BillingActionDialog } from "./BillingSettings/BillingActionDialog";
import { BillingEmailDialog } from "./BillingSettings/BillingEmailDialog";
import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { useStripeBillingController } from "./BillingSettings/useStripeBillingController";
import { buildOrganizationContextModel } from "./OrganizationContext/script";
import { OrganizationCreationDialog } from "./OrganizationCreation/OrganizationCreationDialog";
import { useOrganizationCreationController } from "./OrganizationCreation/useOrganizationCreationController";
import { OrganizationDeletionDialog } from "./OrganizationDeletion/OrganizationDeletionDialog";
import { useOrganizationDeletionController } from "./OrganizationDeletion/useOrganizationDeletionController";
import { OrganizationNameDialog } from "./OrganizationName/OrganizationNameDialog";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { OrganizationSettingsSkeleton, OrganizationSettingsView } from "./OrganizationSettingsView";
import { ShopManagementDialog } from "./ShopManagement/ShopManagementDialog";
import { useShopManagementController } from "./ShopManagement/useShopManagementController";
import type { OrganizationSettingsData, OrganizationSettingsTab } from "./types";

type Props = {
  settings: OrganizationSettingsData;
  context: {
    shops: readonly ShopContextOption[];
    selectedShopId: string;
  };
  defaultTab?: OrganizationSettingsTab;
  onTabChange?: (tab: OrganizationSettingsTab) => void;
  initialVisibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
};

export function OrganizationSettings({
  settings,
  context,
  defaultTab = "people",
  onTabChange,
  initialVisibleUserCount,
  focusedPersonId,
  onVisibleUserCountChange,
}: Props) {
  const navigate = useNavigate();
  const features = normalizeOrganizationSettingsFeatures(settings.features);
  // 旧応答を受けても空のタブを描画しないための互換fallback。現行応答ではbillingは常にtrue。
  const visibleTab = defaultTab === "billing" && !features.billing ? "people" : defaultTab;
  const organizationContext = useMemo(
    () => buildOrganizationContextModel(context.shops, context.selectedShopId),
    [context.selectedShopId, context.shops],
  );
  const organizationName = useOrganizationNameController({
    organizationName: settings.organizationName,
    canUpdateOrganizationName: settings.canUpdateOrganizationName,
  });
  const shopManagement = useShopManagementController({ canAddShop: features.shopAddition && settings.canAddShop });
  const organizationCreation = useOrganizationCreationController({
    canCreateOrganization: features.organizationCreation && settings.canCreateOrganization,
    // 作成直後は新しい組織を操作対象にしたいので、その組織の店舗を選んでDashboardへ移す。
    onCreated: (shopId) => void navigate({ to: "/dashboard", search: { shop: shopId } }),
  });
  const billingEmailSettings = useBillingSettingsController({ billing: settings.billing });
  const stripeBilling = useStripeBillingController({
    organizationName: settings.organizationName,
    billing: settings.billing,
  });
  const organizationDeletion = useOrganizationDeletionController({
    organizationId: settings.organizationId,
    organizationUpdatedAt: settings.organizationUpdatedAt,
    organizationName: settings.organizationName,
    canDeleteOrganization: settings.canDeleteOrganization,
    selectedShopId: context.selectedShopId,
    shops: context.shops,
  });

  if (!organizationContext) {
    return (
      <OrganizationSettingsSkeleton
        defaultTab={visibleTab}
        showOrganizationSelector={groupShopsByOrganization(context.shops).length > 1}
        features={features}
      />
    );
  }

  return (
    <>
      <OrganizationSettingsView
        {...settings}
        features={features}
        planPrices={stripeBilling.planPrices}
        organizationContext={organizationContext}
        defaultTab={visibleTab}
        onTabChange={onTabChange}
        initialVisibleUserCount={initialVisibleUserCount}
        focusedPersonId={focusedPersonId}
        onVisibleUserCountChange={onVisibleUserCountChange}
        actions={{
          onBackToDashboard: () => void navigate({ to: "/dashboard", search: { shop: context.selectedShopId } }),
          onSelectOrganization: (shopId) =>
            void navigate({
              to: "/settings",
              search: { shop: shopId, tab: visibleTab },
            }),
          onUpdateOrganizationName: organizationName.open,
          onManageManagers: () => void navigate({ to: "/settings/managers", search: { shop: context.selectedShopId } }),
          onOpenUser: (personId, visibleUserCount) =>
            void navigate({
              to: "/users/$personId",
              params: { personId },
              search: {
                shop: context.selectedShopId,
                returnTo: "settings",
                users: toUserListCountSearch(visibleUserCount),
              },
            }),
          onAddShop: shopManagement.addShop,
          onOpenShop: (shopId) =>
            void navigate({
              to: "/shops/$shopId",
              params: { shopId },
              search: { shop: context.selectedShopId, returnTo: "settings" },
            }),
          onManagePlan: stripeBilling.managePlan,
          onRetryPlanPrice: stripeBilling.retryPlanPrice,
          onUpdatePaymentMethod: stripeBilling.updatePaymentMethod,
          onUpdateBillingEmail: billingEmailSettings.updateBillingEmail,
          onOpenBillingDocuments: stripeBilling.openBillingDocuments,
          onDeleteOrganization: organizationDeletion.open,
          onCreateOrganization: organizationCreation.createOrganization,
        }}
      />
      <OrganizationNameDialog {...organizationName.dialog} />
      {features.shopAddition && <ShopManagementDialog {...shopManagement.dialog} />}
      {features.organizationCreation && <OrganizationCreationDialog {...organizationCreation.dialog} />}
      {features.billing && <BillingEmailDialog {...billingEmailSettings.dialog} />}
      {features.billing && <BillingActionDialog {...stripeBilling.dialog} />}
      <OrganizationDeletionDialog {...organizationDeletion.dialog} />
    </>
  );
}

export { OrganizationSettingsSkeleton, OrganizationSettingsView } from "./OrganizationSettingsView";
export type {
  BillingDisplayState,
  BillingPlan,
  BillingPlanPrice,
  BillingPlanPriceState,
  BillingPlanPrices,
  BillingProductPlan,
  BillingRequiredReductions,
  BillingUsageView,
  ManagerInvitationStatus,
  ManagerInvitationView,
  OrganizationBillingView,
  OrganizationPersonView,
  OrganizationSettingsActions,
  OrganizationSettingsData,
  OrganizationSettingsTab,
  OrganizationSettingsViewProps,
  OrganizationShopView,
  PaidBillingPlan,
} from "./types";
