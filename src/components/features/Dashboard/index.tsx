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
  operationContextData?: DashboardContentProps["operationContextData"];
};

export function Dashboard({
  shop,
  currentUser,
  managerLegalConsentStatus,
  isReadOnly = false,
  operationContextData,
}: Props) {
  return (
    <DashboardContent
      shop={shop}
      isReadOnly={isReadOnly}
      operationContextData={operationContextData}
      isDashboardOnboardingDismissed={Boolean(
        currentUser && !currentUser.isNewUser && currentUser.dashboardOnboardingDismissedAt,
      )}
      managerLegalConsentStatus={managerLegalConsentStatus}
      managerProfileDefaults={{
        name: currentUser?.name ?? "",
        email: currentUser?.email ?? "",
      }}
    />
  );
}

export const DashboardSkeleton = DashboardContentSkeleton;
