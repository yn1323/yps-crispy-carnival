import { useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { DashboardContent, DashboardContentSkeleton } from "./DashboardContent";
import { type DashboardPlanStatusSource, usePlanStatusCardController } from "./PlanStatusCard";

type DashboardContentProps = ComponentProps<typeof DashboardContent>;

type CurrentUser =
  | {
      isNewUser: boolean;
      name: string;
      email: string;
      dashboardOnboardingDismissedAt?: number;
    }
  | null
  | undefined;

type Props = {
  shop: DashboardContentProps["shop"];
  currentUser: CurrentUser;
  managerLegalConsentStatus: DashboardContentProps["managerLegalConsentStatus"];
  isReadOnly?: boolean;
  visibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
  operationContextData?: DashboardContentProps["operationContextData"];
  planStatus?: DashboardPlanStatusSource | null;
  trialEndingNotice?: DashboardContentProps["trialEndingNotice"];
  billingSettingsShopId?: DashboardContentProps["billingSettingsShopId"];
  isBillingFeatureVisible?: DashboardContentProps["isBillingFeatureVisible"];
};

export function Dashboard({
  shop,
  currentUser,
  managerLegalConsentStatus,
  isReadOnly = false,
  visibleUserCount,
  focusedPersonId,
  onVisibleUserCountChange,
  operationContextData,
  planStatus,
  trialEndingNotice,
  billingSettingsShopId,
  isBillingFeatureVisible,
}: Props) {
  const navigate = useNavigate();
  const planStatusCard = usePlanStatusCardController({
    planStatus,
    shopId: billingSettingsShopId,
    enabled: Boolean(isBillingFeatureVisible),
    onOpenBillingSettings: () =>
      void navigate({
        to: "/settings",
        search: { ...(billingSettingsShopId ? { shop: billingSettingsShopId } : {}), tab: "billing" },
      }),
  });

  return (
    <DashboardContent
      shop={shop}
      isReadOnly={isReadOnly}
      visibleUserCount={visibleUserCount}
      focusedPersonId={focusedPersonId}
      onVisibleUserCountChange={onVisibleUserCountChange}
      operationContextData={operationContextData}
      planStatusCard={planStatusCard}
      trialEndingNotice={trialEndingNotice}
      billingSettingsShopId={billingSettingsShopId}
      isBillingFeatureVisible={isBillingFeatureVisible}
      isDashboardOnboardingDismissed={Boolean(
        currentUser && !currentUser.isNewUser && currentUser.dashboardOnboardingDismissedAt,
      )}
      managerLegalConsentStatus={managerLegalConsentStatus}
      managerProfileDefaults={{
        name: currentUser?.name ?? "",
        email: currentUser?.email ?? "",
      }}
      showAccountDeletion={currentUser?.isNewUser === false}
    />
  );
}

export const DashboardSkeleton = DashboardContentSkeleton;
