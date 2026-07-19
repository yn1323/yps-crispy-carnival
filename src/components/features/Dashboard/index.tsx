import type { ComponentProps } from "react";
import { DashboardContent, DashboardContentSkeleton } from "./DashboardContent";

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
}: Props) {
  return (
    <DashboardContent
      shop={shop}
      isReadOnly={isReadOnly}
      visibleUserCount={visibleUserCount}
      focusedPersonId={focusedPersonId}
      onVisibleUserCountChange={onVisibleUserCountChange}
      operationContextData={operationContextData}
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
