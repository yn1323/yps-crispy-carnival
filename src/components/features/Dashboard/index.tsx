import type { ComponentProps } from "react";
import { DashboardContent, DashboardContentSkeleton } from "./DashboardContent";
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
  navigation,
}: Props) {
  return (
    <DashboardContent
      shop={shop}
      isReadOnly={isReadOnly}
      visibleUserCount={visibleUserCount}
      focusedPersonId={focusedPersonId}
      onVisibleUserCountChange={onVisibleUserCountChange}
      operationContextData={operationContextData}
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
