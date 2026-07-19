import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { toUserListCountSearch } from "@/src/lib/userListSearch";
import type { ShopContextOption } from "@/src/stores/shop";
import { BillingEmailDialog } from "./BillingSettings/BillingEmailDialog";
import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { ManagerInvitationDialog } from "./ManagerInvitation/ManagerInvitationDialog";
import { useManagerInvitationController } from "./ManagerInvitation/useManagerInvitationController";
import { buildOrganizationContextModel } from "./OrganizationContext/script";
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
  const organizationContext = useMemo(
    () => buildOrganizationContextModel(context.shops, context.selectedShopId),
    [context.selectedShopId, context.shops],
  );
  const organizationName = useOrganizationNameController({
    organizationName: settings.organizationName,
    canUpdateOrganizationName: settings.canUpdateOrganizationName,
  });
  const canOpenManagerInvitation =
    settings.canInviteManager || settings.managerInvitations.some((invitation) => invitation.canResend);
  const managerInvitation = useManagerInvitationController({
    canInviteManager: settings.canInviteManager,
    canOpenManagerInvitation,
    managerInvitationMode: settings.managerInvitationMode,
    freeManagerExchangeCandidates: settings.freeManagerExchangeCandidates,
    people: settings.people,
  });
  const shopManagement = useShopManagementController({ canAddShop: settings.canAddShop, shops: settings.shops });
  const billingSettings = useBillingSettingsController({ billing: settings.billing });
  const organizationDeletion = useOrganizationDeletionController({
    organizationId: settings.organizationId,
    organizationUpdatedAt: settings.organizationUpdatedAt,
    organizationName: settings.organizationName,
    canDeleteOrganization: settings.canDeleteOrganization,
    selectedShopId: context.selectedShopId,
    shops: context.shops,
  });

  if (!organizationContext) return <OrganizationSettingsSkeleton />;

  return (
    <>
      <OrganizationSettingsView
        {...settings}
        organizationContext={organizationContext}
        defaultTab={defaultTab}
        onTabChange={onTabChange}
        initialVisibleUserCount={initialVisibleUserCount}
        focusedPersonId={focusedPersonId}
        onVisibleUserCountChange={onVisibleUserCountChange}
        actions={{
          onSelectOrganization: (shopId) =>
            void navigate({
              to: "/settings",
              search: { shop: shopId, tab: defaultTab },
            }),
          onUpdateOrganizationName: organizationName.open,
          onInviteManager: managerInvitation.open,
          onOpenUser: (personId, visibleUserCount) =>
            void navigate({
              to: "/users/$personId",
              params: { personId },
              search: {
                shop: context.selectedShopId,
                tab: "information",
                returnTo: "settings",
                users: toUserListCountSearch(visibleUserCount),
              },
            }),
          onAddShop: shopManagement.addShop,
          onOpenShop: shopManagement.openShop,
          onOpenShopSettings: shopManagement.openShopSettings,
          onManagePlan: billingSettings.managePlan,
          onUpdatePaymentMethod: billingSettings.updatePaymentMethod,
          onUpdateBillingEmail: billingSettings.updateBillingEmail,
          onOpenInvoice: billingSettings.openInvoice,
          onDeleteOrganization: organizationDeletion.open,
        }}
      />
      <OrganizationNameDialog {...organizationName.dialog} />
      <ManagerInvitationDialog {...managerInvitation.dialog} />
      <ShopManagementDialog {...shopManagement.dialog} />
      <BillingEmailDialog {...billingSettings.dialog} />
      <OrganizationDeletionDialog {...organizationDeletion.dialog} />
    </>
  );
}

export { OrganizationSettingsSkeleton, OrganizationSettingsView } from "./OrganizationSettingsView";
export type {
  BillingDisplayState,
  BillingInvoiceView,
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
} from "./types";
