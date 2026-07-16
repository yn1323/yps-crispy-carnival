import { BillingEmailDialog } from "./BillingSettings/BillingEmailDialog";
import { useBillingSettingsController } from "./BillingSettings/useBillingSettingsController";
import { ManagerInvitationDialog } from "./ManagerInvitation/ManagerInvitationDialog";
import { useManagerInvitationController } from "./ManagerInvitation/useManagerInvitationController";
import { OrganizationNameDialog } from "./OrganizationName/OrganizationNameDialog";
import { useOrganizationNameController } from "./OrganizationName/useOrganizationNameController";
import { OrganizationSettingsView } from "./OrganizationSettingsView";
import { PersonRemovalDialog } from "./PersonRemoval/PersonRemovalDialog";
import { usePersonRemovalController } from "./PersonRemoval/usePersonRemovalController";
import { ShopManagementDialog } from "./ShopManagement/ShopManagementDialog";
import { useShopManagementController } from "./ShopManagement/useShopManagementController";
import type { OrganizationSettingsData } from "./types";

type Props = {
  settings: OrganizationSettingsData;
  defaultTab?: "people" | "shops" | "billing";
};

export function OrganizationSettings({ settings, defaultTab = "people" }: Props) {
  const organizationName = useOrganizationNameController({
    organizationName: settings.organizationName,
    canUpdateOrganizationName: settings.canUpdateOrganizationName,
  });
  const managerInvitation = useManagerInvitationController({
    canInviteManager: settings.canInviteManager,
    managerInvitationMode: settings.managerInvitationMode,
    freeManagerExchangeCandidates: settings.freeManagerExchangeCandidates,
    invitations: settings.managerInvitations,
  });
  const personRemoval = usePersonRemovalController(settings.people);
  const shopManagement = useShopManagementController({ canAddShop: settings.canAddShop, shops: settings.shops });
  const billingSettings = useBillingSettingsController({
    billing: settings.billing,
    freeSelection: settings.freeSelection,
  });

  return (
    <>
      <OrganizationSettingsView
        {...settings}
        defaultTab={defaultTab}
        actions={{
          onUpdateOrganizationName: organizationName.open,
          onInviteManager: managerInvitation.open,
          onRemovePersonFromCurrentShop: personRemoval.removeFromCurrentShop,
          onRemoveManagerRole: personRemoval.removeManagerRole,
          onRemovePerson: personRemoval.removePerson,
          onResendInvitation: managerInvitation.resend,
          onRevokeInvitation: managerInvitation.revoke,
          onAddShop: shopManagement.addShop,
          onArchiveShop: shopManagement.archiveShop,
          onReactivateShop: shopManagement.reactivateShop,
          onManagePlan: billingSettings.managePlan,
          onUpdatePaymentMethod: billingSettings.updatePaymentMethod,
          onUpdateBillingEmail: billingSettings.updateBillingEmail,
          onOpenInvoice: billingSettings.openInvoice,
          onSaveFreeSelection: billingSettings.saveFreeSelection,
        }}
      />
      <OrganizationNameDialog {...organizationName.dialog} />
      <ManagerInvitationDialog {...managerInvitation.dialog} />
      <PersonRemovalDialog {...personRemoval.dialog} />
      <ShopManagementDialog {...shopManagement.dialog} />
      <BillingEmailDialog {...billingSettings.dialog} />
    </>
  );
}

export { OrganizationSettingsSkeleton, OrganizationSettingsView } from "./OrganizationSettingsView";
export type {
  BillingDisplayState,
  BillingInvoiceView,
  BillingUsageView,
  FreeSelectionSummary,
  ManagerInvitationStatus,
  ManagerInvitationView,
  OrganizationBillingView,
  OrganizationPersonView,
  OrganizationSettingsActions,
  OrganizationSettingsData,
  OrganizationSettingsViewProps,
  OrganizationShopView,
} from "./types";
