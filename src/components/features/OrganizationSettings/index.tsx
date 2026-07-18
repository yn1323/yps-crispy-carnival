import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { normalizeShopSearch } from "@/src/lib/authenticatedSearch";
import type { ShopContextOption } from "@/src/stores/shop";
import { BillingEmailDialog } from "./BillingSettings/BillingEmailDialog";
import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { ManagerInvitationDialog } from "./ManagerInvitation/ManagerInvitationDialog";
import { useManagerInvitationController } from "./ManagerInvitation/useManagerInvitationController";
import { usePersonManagerAssignmentController } from "./ManagerInvitation/usePersonManagerAssignmentController";
import { buildOrganizationContextModel } from "./OrganizationContext/script";
import { OrganizationDeletionDialog } from "./OrganizationDeletion/OrganizationDeletionDialog";
import { useOrganizationDeletionController } from "./OrganizationDeletion/useOrganizationDeletionController";
import { OrganizationNameDialog } from "./OrganizationName/OrganizationNameDialog";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { OrganizationSettingsSkeleton, OrganizationSettingsView } from "./OrganizationSettingsView";
import { usePersonProfileController } from "./PersonProfile/usePersonProfileController";
import { PersonRemovalDialog } from "./PersonRemoval/PersonRemovalDialog";
import { usePersonRemovalController } from "./PersonRemoval/usePersonRemovalController";
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
};

export function OrganizationSettings({ settings, context, defaultTab = "people", onTabChange }: Props) {
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
  const personManagerAssignment = usePersonManagerAssignmentController(settings.people);
  const personProfile = usePersonProfileController(settings.people);
  const personRemoval = usePersonRemovalController(settings.people);
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
        isUpdatingPersonProfile={personProfile.isRunning}
        isAssigningManager={personManagerAssignment.isRunning}
        defaultTab={defaultTab}
        onTabChange={onTabChange}
        actions={{
          onSelectOrganization: (shopId) =>
            void navigate({
              to: "/settings",
              search: (previous) => normalizeShopSearch(previous, shopId),
            }),
          onUpdateOrganizationName: organizationName.open,
          onInviteManager: managerInvitation.open,
          onUpdatePersonProfile: personProfile.update,
          onAssignManager: personManagerAssignment.assign,
          onRemoveManagerRole: personRemoval.removeManagerRole,
          onRemovePerson: personRemoval.removePerson,
          onAddShop: shopManagement.addShop,
          onOpenShop: shopManagement.openShop,
          onManagePlan: billingSettings.managePlan,
          onUpdatePaymentMethod: billingSettings.updatePaymentMethod,
          onUpdateBillingEmail: billingSettings.updateBillingEmail,
          onOpenInvoice: billingSettings.openInvoice,
          onDeleteOrganization: organizationDeletion.open,
        }}
      />
      <OrganizationNameDialog {...organizationName.dialog} />
      <ManagerInvitationDialog {...managerInvitation.dialog} />
      <PersonRemovalDialog {...personRemoval.dialog} />
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
