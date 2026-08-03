import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { DashboardAnnouncement } from "../DashboardAnnouncement";
import { DashboardOnboarding } from "../DashboardOnboarding";
import { HeroSummary, HeroSummarySkeleton } from "../HeroSummary";
import { LegalReconsent } from "../LegalReconsent";
import type { DashboardNotificationFailure } from "../NotificationFailureDialog";
import { NotificationFailureRecovery } from "../NotificationFailureRecovery";
import { OperationContext, type OperationContextData, OperationContextSkeleton } from "../OperationContext";
import { RecruitmentBoardSkeleton } from "../RecruitmentBoard";
import { RecruitmentManagement, type RecruitmentManagementData } from "../RecruitmentManagement";
import { Setup } from "../Setup";
import type { ShopSettingsData } from "../ShopSettings";
import { StaffManagement, type StaffManagementData } from "../StaffManagement";
import { StaffRegistrationRequestManagement } from "../StaffRegistrationRequestManagement";
import { StaffRosterSkeleton } from "../StaffRoster";
import { TrialEndingCallout, type TrialEndingNoticeData } from "../TrialEndingCallout";
import type {
  DashboardAnnouncement as DashboardAnnouncementData,
  DashboardRecruitmentGroup,
  PaginationStatus,
  Recruitment,
  Staff,
  StaffRegistrationRequest,
} from "../types";

type Props = {
  shop: ShopSettingsData | null;
  isReadOnly?: boolean;
  managerProfileDefaults?: {
    name: string;
    email: string;
  };
  managerLegalConsentStatus?: {
    required: boolean;
    documents: {
      terms: { title: string; path: string };
      privacy: { title: string; path: string };
    };
  };
  recruitments?: Recruitment[];
  recruitmentList?: Recruitment[];
  recruitmentGroups?: DashboardRecruitmentGroup[];
  currentRecruitments?: Recruitment[];
  recruitmentStatus?: PaginationStatus;
  hasPastRecruitments?: boolean;
  isPastRecruitmentsVisible?: boolean;
  pastRecruitmentStatus?: PaginationStatus;
  canLoadMorePastRecruitments?: boolean;
  showPastRecruitments?: () => void;
  loadMorePastRecruitments?: () => void;
  staffs?: Staff[];
  staffStatus?: PaginationStatus;
  canLoadMoreStaffs?: boolean;
  loadMoreStaffs?: () => void;
  visibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
  pendingStaffRequests?: StaffRegistrationRequest[];
  notificationFailures?: DashboardNotificationFailure[];
  isDashboardOnboardingDismissed?: boolean;
  showAccountDeletion?: boolean;
  announcement?: DashboardAnnouncementData | null;
  operationContextData?: OperationContextData;
  trialEndingNotice?: TrialEndingNoticeData | null;
  billingSettingsShopId?: string;
  isBillingFeatureVisible?: boolean;
};

export const DashboardContent = ({
  shop,
  isReadOnly = false,
  managerProfileDefaults,
  managerLegalConsentStatus,
  recruitments,
  recruitmentList,
  recruitmentGroups,
  currentRecruitments,
  hasPastRecruitments,
  isPastRecruitmentsVisible,
  pastRecruitmentStatus,
  canLoadMorePastRecruitments,
  showPastRecruitments,
  loadMorePastRecruitments,
  staffs,
  staffStatus,
  canLoadMoreStaffs,
  loadMoreStaffs,
  visibleUserCount,
  focusedPersonId,
  onVisibleUserCountChange,
  pendingStaffRequests,
  notificationFailures,
  isDashboardOnboardingDismissed = false,
  showAccountDeletion = false,
  announcement,
  operationContextData,
  trialEndingNotice,
  billingSettingsShopId,
  isBillingFeatureVisible = false,
}: Props) => {
  // Storyはqueryに依存せず募集・スタッフの代表状態を固定する。本番の募集・スタッフは各子featureが購読する。
  const usesInjectedData = recruitments !== undefined || staffs !== undefined;
  const recruitmentData: RecruitmentManagementData | undefined = usesInjectedData
    ? {
        recruitments: recruitments ?? [],
        recruitmentList,
        groups: recruitmentGroups,
        currentRecruitments,
        hasPastRecruitments,
        isPastRecruitmentsVisible,
        pastStatus: pastRecruitmentStatus,
        canLoadMorePastRecruitments,
        onShowPastRecruitments: showPastRecruitments,
        onLoadMorePastRecruitments: loadMorePastRecruitments,
      }
    : undefined;
  const staffData: StaffManagementData | undefined = usesInjectedData
    ? {
        staffs: staffs ?? [],
        status: staffStatus,
        canLoadMore: canLoadMoreStaffs,
        onLoadMore: loadMoreStaffs,
      }
    : undefined;

  return (
    <DashboardAnnouncement announcement={usesInjectedData ? (announcement ?? null) : undefined}>
      {({ content: announcementContent }) => {
        if (!shop) {
          return (
            <Setup
              managerProfileDefaults={managerProfileDefaults}
              showAccountDeletion={showAccountDeletion}
              announcement={announcementContent}
            />
          );
        }

        return (
          <RecruitmentManagement
            regularClosedDays={shop.regularClosedDays}
            data={recruitmentData}
            isReadOnly={isReadOnly}
          >
            {(recruitment) => (
              <StaffManagement
                data={staffData}
                openRecruitments={recruitment.openRecruitments}
                currentRecruitments={recruitment.currentRecruitments}
                isReadOnly={isReadOnly}
                initialVisibleUserCount={visibleUserCount}
                focusedPersonId={focusedPersonId}
                onVisibleUserCountChange={onVisibleUserCountChange}
              >
                {(staff) => (
                  <StaffRegistrationRequestManagement
                    requests={usesInjectedData ? (pendingStaffRequests ?? []) : undefined}
                    isReadOnly={isReadOnly}
                  >
                    {(registrationRequests) => (
                      <NotificationFailureRecovery
                        failures={usesInjectedData ? (notificationFailures ?? []) : undefined}
                        isReadOnly={isReadOnly}
                      >
                        {(notificationFailure) => {
                          if (recruitment.isInitialLoading) {
                            return <DashboardContentSkeleton />;
                          }

                          return (
                            <DashboardOnboarding
                              recruitments={recruitment.knownRecruitments}
                              staffs={staff.staffs}
                              pendingStaffRequestCount={registrationRequests.requests.length}
                              isDismissed={isDashboardOnboardingDismissed}
                              canShow={
                                !staff.isInitialLoading &&
                                !registrationRequests.isInitialLoading &&
                                !isReadOnly &&
                                managerLegalConsentStatus?.required === false
                              }
                            >
                              {(onboarding) => (
                                <>
                                  <ContentWrapper>
                                    <OperationContext data={operationContextData} />
                                    <LegalReconsent status={managerLegalConsentStatus} />
                                    {billingSettingsShopId && (
                                      <TrialEndingCallout
                                        notice={trialEndingNotice ?? null}
                                        shopId={billingSettingsShopId}
                                        isBillingVisible={isBillingFeatureVisible}
                                      />
                                    )}
                                    <HeroSummary
                                      recruitments={recruitment.recruitments}
                                      onOpenShiftBoard={(recruitmentId) =>
                                        recruitment.openShiftBoard(
                                          recruitmentId as Recruitment["_id"],
                                          onboarding.onOpenRecruitment,
                                        )
                                      }
                                      onCreateRecruitment={recruitment.openCreateRecruitment}
                                      hasNotificationFailures={notificationFailure.failures.length > 0}
                                      onNotificationFailuresClick={notificationFailure.openNotificationFailures}
                                      announcementBanner={announcementContent ?? undefined}
                                      staffRegistrationRequest={
                                        registrationRequests.requests.length > 0
                                          ? {
                                              count: registrationRequests.requests.length,
                                              onClick: registrationRequests.openStaffRegistrationRequests,
                                            }
                                          : undefined
                                      }
                                      hideActionSection={
                                        isReadOnly ||
                                        (onboarding.isVisible && notificationFailure.failures.length === 0) ||
                                        !managerLegalConsentStatus
                                      }
                                    />
                                    {onboarding.content}
                                    {recruitment.renderContent({
                                      onBeforeOpenShiftBoard: onboarding.onOpenRecruitment,
                                    })}
                                    {staff.content}
                                  </ContentWrapper>
                                  {registrationRequests.content}
                                  {notificationFailure.content}
                                </>
                              )}
                            </DashboardOnboarding>
                          );
                        }}
                      </NotificationFailureRecovery>
                    )}
                  </StaffRegistrationRequestManagement>
                )}
              </StaffManagement>
            )}
          </RecruitmentManagement>
        );
      }}
    </DashboardAnnouncement>
  );
};

export const DashboardContentSkeleton = () => (
  <ContentWrapper>
    <OperationContextSkeleton />
    <HeroSummarySkeleton />
    <RecruitmentBoardSkeleton />
    <StaffRosterSkeleton />
  </ContentWrapper>
);
