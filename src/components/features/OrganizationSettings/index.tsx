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
import type { OrganizationSettingsData, OrganizationSettingsTab } from "./types";

type Props = {
  settings: OrganizationSettingsData;
  defaultTab?: OrganizationSettingsTab;
  onTabChange?: (tab: OrganizationSettingsTab) => void;
};

export function OrganizationSettings({ settings, defaultTab = "people", onTabChange }: Props) {
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
  const billingSettings = useBillingSettingsController({ billing: settings.billing });

  return (
    <>
      <OrganizationSettingsView
        {...settings}
        defaultTab={defaultTab}
        onTabChange={onTabChange}
        actions={{
          onUpdateOrganizationName: organizationName.open,
          onInviteManager: managerInvitation.open,
          onRemoveManagerRole: personRemoval.removeManagerRole,
          onRemovePerson: personRemoval.removePerson,
          onResendInvitation: managerInvitation.resend,
          onRevokeInvitation: managerInvitation.revoke,
          onAddShop: shopManagement.addShop,
          onOpenShop: shopManagement.openShop,
          onManagePlan: billingSettings.managePlan,
          onUpdatePaymentMethod: billingSettings.updatePaymentMethod,
          onUpdateBillingEmail: billingSettings.updateBillingEmail,
          onOpenInvoice: billingSettings.openInvoice,
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
