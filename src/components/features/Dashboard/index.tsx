import { useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { DashboardContent, DashboardContentSkeleton } from "./DashboardContent";
import { type DashboardPlanStatusSource, usePlanStatusCardController } from "./PlanStatusCard";
import type { DashboardNavigation } from "./types";

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
  showOrganizationContext?: DashboardContentProps["showOrganizationContext"];
  planStatus?: DashboardPlanStatusSource | null;
  trialEndingNotice?: DashboardContentProps["trialEndingNotice"];
  billingSettingsShopId?: DashboardContentProps["billingSettingsShopId"];
  isBillingFeatureVisible?: DashboardContentProps["isBillingFeatureVisible"];
  expectedOrganizationId?: Id<"organizations">;
  navigation?: DashboardNavigation;
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
  showOrganizationContext = true,
  planStatus,
  trialEndingNotice,
  billingSettingsShopId,
  isBillingFeatureVisible,
  expectedOrganizationId,
  navigation,
}: Props) {
  const navigate = useNavigate();
  const planStatusCard = usePlanStatusCardController({
    planStatus,
    shopId: billingSettingsShopId,
    expectedOrganizationId,
    enabled: Boolean(isBillingFeatureVisible),
    onOpenBillingSettings:
      navigation?.onOpenBillingSettings ??
      (() =>
        void navigate({
          to: "/settings",
          search: { ...(billingSettingsShopId ? { shop: billingSettingsShopId } : {}), tab: "billing" },
        })),
  });

  return (
    <DashboardContent
      shop={shop}
      isReadOnly={isReadOnly}
      visibleUserCount={visibleUserCount}
      focusedPersonId={focusedPersonId}
      onVisibleUserCountChange={onVisibleUserCountChange}
      operationContextData={operationContextData}
      showOrganizationContext={showOrganizationContext}
      planStatusCard={planStatusCard}
      trialEndingNotice={trialEndingNotice}
      billingSettingsShopId={billingSettingsShopId}
      isBillingFeatureVisible={isBillingFeatureVisible}
      navigation={navigation}
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

export { HeroSummary } from "./HeroSummary";
export type { OperationContextModel } from "./OperationContext";
export { buildOperationContextModel, OperationContextView } from "./OperationContext";
export { RecruitmentBoard } from "./RecruitmentBoard";
export { StaffRoster } from "./StaffRoster";
export type { DashboardNavigation, DashboardRecruitmentGroup, Recruitment, Staff } from "./types";
