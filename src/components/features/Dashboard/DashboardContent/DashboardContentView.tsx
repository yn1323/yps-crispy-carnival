import { Stack } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { DashboardOnboarding, type DashboardOnboardingRenderState } from "../DashboardOnboarding";
import { HeroSummary, HeroSummarySkeleton } from "../HeroSummary";
import { LegalReconsent } from "../LegalReconsent";
import type { NotificationFailureRecoveryState } from "../NotificationFailureRecovery";
import { OperationContext, type OperationContextData, OperationContextSkeleton } from "../OperationContext";
import type { PlanStatusCardProps } from "../PlanStatusCard";
import { RecruitmentBoardSkeleton } from "../RecruitmentBoard";
import type { RecruitmentManagementState } from "../RecruitmentManagement";
import type { StaffManagementState } from "../StaffManagement";
import type { StaffRegistrationRequestManagementState } from "../StaffRegistrationRequestManagement";
import { StaffRosterSkeleton } from "../StaffRoster";
import { TrialEndingCallout, type TrialEndingNoticeData } from "../TrialEndingCallout";
import type { DashboardNavigation } from "../types";
import { DashboardSectionUnavailable } from "./DashboardSectionUnavailable";
import { type DashboardQueryStage, getDashboardStageReadiness } from "./queryStage";

type ManagerLegalConsentStatus = {
  required: boolean;
  documents: {
    terms: { title: string; path: string };
    privacy: { title: string; path: string };
  };
};

export type DashboardContentViewProps = {
  taskScopeKey: string;
  isReadOnly: boolean;
  managerLegalConsentStatus?: ManagerLegalConsentStatus;
  isDashboardOnboardingDismissed: boolean;
  announcementContent?: ReactNode;
  operationContextData?: OperationContextData;
  showOrganizationContext?: boolean;
  planStatusCard?: PlanStatusCardProps | null;
  trialEndingNotice?: TrialEndingNoticeData | null;
  billingSettingsShopId?: string;
  recruitment: DashboardQueryStage<RecruitmentManagementState>;
  staff: DashboardQueryStage<StaffManagementState>;
  registrationRequests: DashboardQueryStage<StaffRegistrationRequestManagementState>;
  notificationFailures: DashboardQueryStage<NotificationFailureRecoveryState>;
  navigation?: DashboardNavigation;
};

export function DashboardContentView({
  taskScopeKey,
  isReadOnly,
  managerLegalConsentStatus,
  isDashboardOnboardingDismissed,
  announcementContent,
  operationContextData,
  showOrganizationContext = true,
  planStatusCard,
  trialEndingNotice,
  billingSettingsShopId,
  recruitment,
  staff,
  registrationRequests,
  notificationFailures,
  navigation,
}: DashboardContentViewProps) {
  if (recruitment.status === "loading") {
    return <DashboardContentSkeleton showOrganizationContext={showOrganizationContext} />;
  }

  const recruitmentData = recruitment.status === "ready" ? recruitment.data : null;
  const staffData = staff.status === "ready" ? staff.data : null;
  const registrationRequestData = registrationRequests.status === "ready" ? registrationRequests.data : null;
  const notificationFailureData = notificationFailures.status === "ready" ? notificationFailures.data : null;
  const readiness = getDashboardStageReadiness({ recruitment, staff, registrationRequests, notificationFailures });
  const unavailableTaskSources = [
    recruitment.status === "unavailable"
      ? { key: "recruitment", label: "シフト募集", onRetry: recruitment.onRetry }
      : null,
    registrationRequests.status === "unavailable"
      ? { key: "registration-requests", label: "登録申請", onRetry: registrationRequests.onRetry }
      : null,
    notificationFailures.status === "unavailable"
      ? { key: "notification-failures", label: "通知", onRetry: notificationFailures.onRetry }
      : null,
  ].filter((source): source is NonNullable<typeof source> => source !== null);

  return (
    <DashboardOnboardingGate
      canEvaluate={readiness.canEvaluateOnboarding}
      recruitments={recruitmentData?.knownRecruitments ?? []}
      staffs={staffData?.staffs ?? []}
      pendingStaffRequestCount={registrationRequestData?.requests.length ?? 0}
      isDismissed={isDashboardOnboardingDismissed}
      canShow={!isReadOnly && managerLegalConsentStatus?.required === false}
    >
      {(onboarding) => (
        <>
          <ContentWrapper>
            <Stack gap={{ base: 4, lg: 6 }}>
              <Stack gap={{ base: 3, lg: 4 }}>
                <OperationContext
                  data={operationContextData}
                  showOrganizationContext={showOrganizationContext}
                  planStatusCard={planStatusCard}
                  billingSettingsShopId={billingSettingsShopId}
                  onOpenOrganizationSettings={navigation?.onOpenOrganizationSettings}
                  onOpenShopDetail={navigation?.onOpenShopDetail}
                />
                <LegalReconsent status={managerLegalConsentStatus} />
                {planStatusCard === undefined && billingSettingsShopId && navigation?.onOpenBillingSettings ? (
                  <TrialEndingCallout
                    notice={trialEndingNotice ?? null}
                    onOpenBillingSettings={navigation.onOpenBillingSettings}
                  />
                ) : null}
              </Stack>
              <HeroSummary
                key={taskScopeKey}
                recruitments={recruitmentData?.recruitments ?? []}
                isRecruitmentTaskAvailable={recruitmentData !== null}
                onOpenShiftBoard={(recruitmentId) =>
                  recruitmentData?.openShiftBoard(
                    recruitmentId as Parameters<RecruitmentManagementState["openShiftBoard"]>[0],
                    onboarding.onOpenRecruitment,
                  )
                }
                onCreateRecruitment={() => recruitmentData?.openCreateRecruitment()}
                notificationFailures={
                  notificationFailureData && notificationFailureData.actionItemCount > 0
                    ? {
                        count: notificationFailureData.actionItemCount,
                        content: notificationFailureData.content,
                      }
                    : undefined
                }
                announcementBanner={announcementContent}
                staffRegistrationRequest={
                  registrationRequestData && registrationRequestData.actionItemCount > 0
                    ? {
                        count: registrationRequestData.actionItemCount,
                        content: registrationRequestData.content,
                      }
                    : undefined
                }
                unavailableTaskSources={unavailableTaskSources}
                hideActionSection={
                  isReadOnly ||
                  (onboarding.isVisible &&
                    (notificationFailureData?.actionItemCount ?? 0) === 0 &&
                    !readiness.hasUnavailableTasks) ||
                  !managerLegalConsentStatus
                }
              />
            </Stack>
            {onboarding.content}
            {recruitment.status === "ready" ? (
              recruitment.data.renderContent({ onBeforeOpenShiftBoard: onboarding.onOpenRecruitment })
            ) : (
              <DashboardSectionUnavailable title="シフト募集を読み込めませんでした" onRetry={recruitment.onRetry} />
            )}
            {staff.status === "ready" ? (
              staff.data.content
            ) : staff.status === "loading" ? (
              <StaffRosterSkeleton />
            ) : (
              <DashboardSectionUnavailable title="スタッフ一覧を読み込めませんでした" onRetry={staff.onRetry} />
            )}
          </ContentWrapper>
        </>
      )}
    </DashboardOnboardingGate>
  );
}

type DashboardOnboardingGateProps = ComponentProps<typeof DashboardOnboarding> & {
  canEvaluate: boolean;
};

function DashboardOnboardingGate({ canEvaluate, children, ...props }: DashboardOnboardingGateProps) {
  if (!canEvaluate) {
    const unavailableState: DashboardOnboardingRenderState = {
      content: null,
      isVisible: false,
      onOpenRecruitment: () => {},
    };
    return children(unavailableState);
  }

  return <DashboardOnboarding {...props}>{children}</DashboardOnboarding>;
}

export const DashboardContentSkeleton = ({
  showOrganizationContext = true,
}: {
  showOrganizationContext?: boolean;
} = {}) => (
  <ContentWrapper>
    <Stack gap={{ base: 4, lg: 6 }}>
      <OperationContextSkeleton showOrganizationContext={showOrganizationContext} />
      <HeroSummarySkeleton />
    </Stack>
    <RecruitmentBoardSkeleton />
    <StaffRosterSkeleton />
  </ContentWrapper>
);
