import { type ComponentProps, memo, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { DashboardAnnouncement } from "../DashboardAnnouncement";
import type { DashboardNotificationFailure } from "../NotificationFailureDialog";
import { NotificationFailureRecovery, type NotificationFailureRecoveryState } from "../NotificationFailureRecovery";
import type { OperationContextData } from "../OperationContext";
import type { PlanStatusCardProps } from "../PlanStatusCard";
import {
  RecruitmentManagement,
  type RecruitmentManagementData,
  type RecruitmentManagementState,
} from "../RecruitmentManagement";
import { Setup } from "../Setup";
import type { ShopSettingsData } from "../ShopSettings";
import { StaffManagement, type StaffManagementData, type StaffManagementState } from "../StaffManagement";
import {
  StaffRegistrationRequestManagement,
  type StaffRegistrationRequestManagementState,
} from "../StaffRegistrationRequestManagement";
import type { TrialEndingNoticeData } from "../TrialEndingCallout";
import type {
  DashboardAnnouncement as DashboardAnnouncementData,
  DashboardNavigation,
  DashboardRecruitmentGroup,
  PaginationStatus,
  Recruitment,
  Staff,
  StaffRegistrationRequest,
} from "../types";
import { DashboardContentView } from "./DashboardContentView";
import { DashboardQueryStageBoundary } from "./DashboardQueryStageBoundary";
import { type DashboardQueryStage, resolveDashboardQueryStage, unavailableDashboardQueryStage } from "./queryStage";

export { DashboardContentSkeleton, DashboardContentView } from "./DashboardContentView";

const EMPTY_RECRUITMENTS: Recruitment[] = [];
const EMPTY_STAFFS: Staff[] = [];
const EMPTY_STAFF_REGISTRATION_REQUESTS: StaffRegistrationRequest[] = [];
const EMPTY_NOTIFICATION_FAILURES: DashboardNotificationFailure[] = [];
const LOADING_DASHBOARD_QUERY_STAGE = { status: "loading" } as const;

type DashboardQueryStageSnapshot<T> = {
  sourceIdentity: string;
  stage: DashboardQueryStage<T>;
};

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
  showOrganizationContext?: boolean;
  planStatusCard?: PlanStatusCardProps | null;
  trialEndingNotice?: TrialEndingNoticeData | null;
  billingSettingsShopId?: string;
  isBillingFeatureVisible?: boolean;
  navigation?: DashboardNavigation;
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
  showOrganizationContext = true,
  planStatusCard,
  trialEndingNotice,
  billingSettingsShopId,
  isBillingFeatureVisible = false,
  navigation,
}: Props) => {
  // Storyはqueryに依存せず募集・スタッフの代表状態を固定する。本番の募集・スタッフは各子featureが購読する。
  const usesInjectedData = recruitments !== undefined || staffs !== undefined;
  const recruitmentData = useMemo<RecruitmentManagementData | undefined>(
    () =>
      usesInjectedData
        ? {
            recruitments: recruitments ?? EMPTY_RECRUITMENTS,
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
        : undefined,
    [
      canLoadMorePastRecruitments,
      currentRecruitments,
      hasPastRecruitments,
      isPastRecruitmentsVisible,
      loadMorePastRecruitments,
      pastRecruitmentStatus,
      recruitmentGroups,
      recruitmentList,
      recruitments,
      showPastRecruitments,
      usesInjectedData,
    ],
  );
  const staffData = useMemo<StaffManagementData | undefined>(
    () =>
      usesInjectedData
        ? {
            staffs: staffs ?? EMPTY_STAFFS,
            status: staffStatus,
            canLoadMore: canLoadMoreStaffs,
            onLoadMore: loadMoreStaffs,
          }
        : undefined,
    [canLoadMoreStaffs, loadMoreStaffs, staffStatus, staffs, usesInjectedData],
  );
  const operationSelectedShopId = operationContextData?.selectedShop.shopId;
  const operationSelectedShopName = operationContextData?.selectedShop.shopName;
  const recruitmentShopTarget = useMemo(
    () =>
      operationSelectedShopId
        ? {
            mode: "fixed" as const,
            shop: {
              shopId: operationSelectedShopId,
              shopName: operationSelectedShopName ?? "",
            },
          }
        : undefined,
    [operationSelectedShopId, operationSelectedShopName],
  );

  const sourceIdentity =
    operationContextData?.selectedShop.shopId ?? (usesInjectedData ? "injected" : (shop?.name ?? "no-shop"));
  const [recruitmentSnapshot, setRecruitmentSnapshot] = useState<
    DashboardQueryStageSnapshot<RecruitmentManagementState> | undefined
  >();
  const [staffSnapshot, setStaffSnapshot] = useState<DashboardQueryStageSnapshot<StaffManagementState> | undefined>();
  const [registrationRequestSnapshot, setRegistrationRequestSnapshot] = useState<
    DashboardQueryStageSnapshot<StaffRegistrationRequestManagementState> | undefined
  >();
  const [notificationFailureSnapshot, setNotificationFailureSnapshot] = useState<
    DashboardQueryStageSnapshot<NotificationFailureRecoveryState> | undefined
  >();

  useLayoutEffect(() => {
    if (shop !== null) return;
    setRecruitmentSnapshot(undefined);
    setStaffSnapshot(undefined);
    setRegistrationRequestSnapshot(undefined);
    setNotificationFailureSnapshot(undefined);
  }, [shop]);

  const reportRecruitmentStage = useCallback(
    (stage: DashboardQueryStage<RecruitmentManagementState>) => setRecruitmentSnapshot({ sourceIdentity, stage }),
    [sourceIdentity],
  );
  const reportStaffStage = useCallback(
    (stage: DashboardQueryStage<StaffManagementState>) => setStaffSnapshot({ sourceIdentity, stage }),
    [sourceIdentity],
  );
  const reportRegistrationRequestStage = useCallback(
    (stage: DashboardQueryStage<StaffRegistrationRequestManagementState>) =>
      setRegistrationRequestSnapshot({ sourceIdentity, stage }),
    [sourceIdentity],
  );
  const reportNotificationFailureStage = useCallback(
    (stage: DashboardQueryStage<NotificationFailureRecoveryState>) =>
      setNotificationFailureSnapshot({ sourceIdentity, stage }),
    [sourceIdentity],
  );

  const recruitmentStage = getCurrentDashboardQueryStage(recruitmentSnapshot, sourceIdentity);
  const staffStage = getCurrentDashboardQueryStage(staffSnapshot, sourceIdentity);
  const registrationRequestStage = getCurrentDashboardQueryStage(registrationRequestSnapshot, sourceIdentity);
  const notificationFailureStage = getCurrentDashboardQueryStage(notificationFailureSnapshot, sourceIdentity);

  return (
    <DashboardAnnouncement
      announcement={usesInjectedData ? (announcement ?? null) : undefined}
      context={operationContextData?.selectedShop}
    >
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
          <>
            <RecruitmentQuerySource
              key={`recruitment:${sourceIdentity}`}
              onStageChange={reportRecruitmentStage}
              regularClosedDays={shop.regularClosedDays}
              shopTarget={recruitmentShopTarget}
              data={recruitmentData}
              isReadOnly={isReadOnly}
              onOpenShiftBoard={navigation?.onOpenShiftBoard}
            />
            <StaffQuerySource
              key={`staff:${sourceIdentity}`}
              onStageChange={reportStaffStage}
              data={staffData}
              openRecruitments={
                recruitmentStage.status === "ready" ? recruitmentStage.data.openRecruitments : EMPTY_RECRUITMENTS
              }
              currentRecruitments={
                recruitmentStage.status === "ready" ? recruitmentStage.data.currentRecruitments : EMPTY_RECRUITMENTS
              }
              recruitmentDataStatus={recruitmentStage.status}
              isReadOnly={isReadOnly}
              initialVisibleUserCount={visibleUserCount}
              focusedPersonId={focusedPersonId}
              onVisibleUserCountChange={onVisibleUserCountChange}
              onOpenStaffDetail={navigation?.onOpenStaffDetail}
              onManageManagers={navigation?.onManageManagers}
            />
            <RegistrationRequestQuerySource
              key={`registration-requests:${sourceIdentity}`}
              onStageChange={reportRegistrationRequestStage}
              requests={usesInjectedData ? (pendingStaffRequests ?? EMPTY_STAFF_REGISTRATION_REQUESTS) : undefined}
              isReadOnly={isReadOnly}
            />
            <NotificationFailureQuerySource
              key={`notification-failures:${sourceIdentity}`}
              onStageChange={reportNotificationFailureStage}
              failures={usesInjectedData ? (notificationFailures ?? EMPTY_NOTIFICATION_FAILURES) : undefined}
              isReadOnly={isReadOnly}
            />
            <DashboardContentView
              isReadOnly={isReadOnly}
              managerLegalConsentStatus={managerLegalConsentStatus}
              isDashboardOnboardingDismissed={isDashboardOnboardingDismissed}
              announcementContent={announcementContent ?? undefined}
              operationContextData={operationContextData}
              showOrganizationContext={showOrganizationContext}
              planStatusCard={planStatusCard}
              trialEndingNotice={trialEndingNotice}
              billingSettingsShopId={billingSettingsShopId}
              isBillingFeatureVisible={isBillingFeatureVisible}
              navigation={navigation}
              recruitment={recruitmentStage}
              staff={staffStage}
              registrationRequests={registrationRequestStage}
              notificationFailures={notificationFailureStage}
            />
          </>
        );
      }}
    </DashboardAnnouncement>
  );
};

function getCurrentDashboardQueryStage<T>(
  snapshot: DashboardQueryStageSnapshot<T> | undefined,
  sourceIdentity: string,
): DashboardQueryStage<T> {
  return snapshot?.sourceIdentity === sourceIdentity ? snapshot.stage : LOADING_DASHBOARD_QUERY_STAGE;
}

type DashboardQueryStageReporterProps<T> = {
  stage: DashboardQueryStage<T>;
  onStageChange: (stage: DashboardQueryStage<T>) => void;
};

function DashboardQueryStageReporter<T>({ stage, onStageChange }: DashboardQueryStageReporterProps<T>) {
  useLayoutEffect(() => {
    onStageChange(stage);
  }, [onStageChange, stage]);

  return null;
}

type RecruitmentQuerySourceProps = Omit<ComponentProps<typeof RecruitmentManagement>, "children"> & {
  onStageChange: (stage: DashboardQueryStage<RecruitmentManagementState>) => void;
};

const RecruitmentQuerySource = memo(function RecruitmentQuerySource({
  onStageChange,
  ...props
}: RecruitmentQuerySourceProps) {
  return (
    <DashboardQueryStageBoundary
      fallback={({ onRetry }) => (
        <DashboardQueryStageReporter
          stage={unavailableDashboardQueryStage<RecruitmentManagementState>(onRetry)}
          onStageChange={onStageChange}
        />
      )}
    >
      <RecruitmentManagement {...props}>
        {(state) => (
          <DashboardQueryStageReporter
            stage={resolveDashboardQueryStage(state.isInitialLoading, state)}
            onStageChange={onStageChange}
          />
        )}
      </RecruitmentManagement>
    </DashboardQueryStageBoundary>
  );
});

type StaffQuerySourceProps = Omit<ComponentProps<typeof StaffManagement>, "children"> & {
  onStageChange: (stage: DashboardQueryStage<StaffManagementState>) => void;
};

const StaffQuerySource = memo(function StaffQuerySource({ onStageChange, ...props }: StaffQuerySourceProps) {
  return (
    <DashboardQueryStageBoundary
      fallback={({ onRetry }) => (
        <DashboardQueryStageReporter
          stage={unavailableDashboardQueryStage<StaffManagementState>(onRetry)}
          onStageChange={onStageChange}
        />
      )}
    >
      <StaffManagement {...props}>
        {(state) => (
          <DashboardQueryStageReporter
            stage={resolveDashboardQueryStage(state.isInitialLoading, state)}
            onStageChange={onStageChange}
          />
        )}
      </StaffManagement>
    </DashboardQueryStageBoundary>
  );
});

type RegistrationRequestQuerySourceProps = Omit<
  ComponentProps<typeof StaffRegistrationRequestManagement>,
  "children"
> & {
  onStageChange: (stage: DashboardQueryStage<StaffRegistrationRequestManagementState>) => void;
};

const RegistrationRequestQuerySource = memo(function RegistrationRequestQuerySource({
  onStageChange,
  ...props
}: RegistrationRequestQuerySourceProps) {
  return (
    <DashboardQueryStageBoundary
      fallback={({ onRetry }) => (
        <DashboardQueryStageReporter
          stage={unavailableDashboardQueryStage<StaffRegistrationRequestManagementState>(onRetry)}
          onStageChange={onStageChange}
        />
      )}
    >
      <StaffRegistrationRequestManagement {...props}>
        {(state) => (
          <DashboardQueryStageReporter
            stage={resolveDashboardQueryStage(state.isInitialLoading, state)}
            onStageChange={onStageChange}
          />
        )}
      </StaffRegistrationRequestManagement>
    </DashboardQueryStageBoundary>
  );
});

type NotificationFailureQuerySourceProps = Omit<ComponentProps<typeof NotificationFailureRecovery>, "children"> & {
  onStageChange: (stage: DashboardQueryStage<NotificationFailureRecoveryState>) => void;
};

const NotificationFailureQuerySource = memo(function NotificationFailureQuerySource({
  onStageChange,
  ...props
}: NotificationFailureQuerySourceProps) {
  return (
    <DashboardQueryStageBoundary
      fallback={({ onRetry }) => (
        <DashboardQueryStageReporter
          stage={unavailableDashboardQueryStage<NotificationFailureRecoveryState>(onRetry)}
          onStageChange={onStageChange}
        />
      )}
    >
      <NotificationFailureRecovery {...props}>
        {(state) => (
          <DashboardQueryStageReporter
            stage={resolveDashboardQueryStage(state.isInitialLoading, state)}
            onStageChange={onStageChange}
          />
        )}
      </NotificationFailureRecovery>
    </DashboardQueryStageBoundary>
  );
});
