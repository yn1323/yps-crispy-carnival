import { Box } from "@chakra-ui/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { type ReactNode, useState } from "react";
import { api } from "@/convex/_generated/api";
import { DashboardContent, DashboardContentSkeleton } from "@/src/components/features/Dashboard/DashboardContent";
import { buildDashboardRecruitmentGroups } from "@/src/components/features/Dashboard/types";
import { Animation } from "@/src/components/templates/Animation";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";

const ACTIVE_RECRUITMENT_QUERY_PAGE_SIZE = 100;
const PAST_RECRUITMENT_PAGE_SIZE = 5;
const NOTIFICATION_FAILURE_PAGE_SIZE = 50;
const STAFF_INITIAL_VISIBLE_COUNT = 10;
const STAFF_LOAD_MORE_COUNT = 10;
const STAFF_QUERY_PAGE_SIZE = STAFF_INITIAL_VISIBLE_COUNT + 1;

export function DashboardPage() {
  const [isPastRecruitmentsVisible, setIsPastRecruitmentsVisible] = useState(false);
  const [visibleStaffCount, setVisibleStaffCount] = useState(STAFF_INITIAL_VISIBLE_COUNT);
  const shop = useQuery(api.dashboard.queries.getDashboardShop);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, {});
  const announcement = useQuery(api.dashboard.queries.getActiveDashboardAnnouncement, {});
  const skipPagination = shop === undefined || shop === null;
  const managerLegalConsentStatus = useQuery(
    api.legal.queries.getManagerConsentStatus,
    shop === undefined || shop === null ? "skip" : {},
  );
  const recruitments = usePaginatedQuery(api.dashboard.queries.getDashboardRecruitments, skipPagination ? "skip" : {}, {
    initialNumItems: ACTIVE_RECRUITMENT_QUERY_PAGE_SIZE,
  });
  const hasPastRecruitments = useQuery(
    api.dashboard.queries.hasDashboardPastRecruitments,
    skipPagination ? "skip" : {},
  );
  const pastRecruitments = usePaginatedQuery(
    api.dashboard.queries.getDashboardPastRecruitments,
    skipPagination || !isPastRecruitmentsVisible ? "skip" : {},
    {
      initialNumItems: PAST_RECRUITMENT_PAGE_SIZE,
    },
  );
  const staffs = usePaginatedQuery(api.dashboard.queries.getDashboardStaffs, skipPagination ? "skip" : {}, {
    initialNumItems: STAFF_QUERY_PAGE_SIZE,
  });
  const pendingStaffRequests = useQuery(
    api.staffRegistration.queries.getPendingRequests,
    shop === undefined || shop === null ? "skip" : {},
  );
  const notificationFailures = usePaginatedQuery(
    api.notificationOutbox.queries.listOpenFailures,
    skipPagination ? "skip" : {},
    {
      initialNumItems: NOTIFICATION_FAILURE_PAGE_SIZE,
    },
  );

  const dashboardRecruitmentGroups = buildDashboardRecruitmentGroups({
    recruitments: [...recruitments.results, ...pastRecruitments.results],
  });
  const currentRecruitments =
    dashboardRecruitmentGroups.groups.find((group) => group.key === "current")?.recruitments ?? [];

  const canLoadMorePastRecruitments =
    isPastRecruitmentsVisible &&
    (pastRecruitments.status === "CanLoadMore" || pastRecruitments.status === "LoadingMore");
  const canLoadMoreStaffs =
    staffs.results.length > visibleStaffCount || staffs.status === "CanLoadMore" || staffs.status === "LoadingMore";

  const handleShowPastRecruitments = () => {
    setIsPastRecruitmentsVisible(true);
  };

  const handleLoadMorePastRecruitments = () => {
    pastRecruitments.loadMore(PAST_RECRUITMENT_PAGE_SIZE);
  };

  const handleLoadMoreStaffs = () => {
    const nextVisibleCount = visibleStaffCount + STAFF_LOAD_MORE_COUNT;
    setVisibleStaffCount(nextVisibleCount);
    if (staffs.status === "CanLoadMore" && staffs.results.length <= nextVisibleCount) {
      staffs.loadMore(STAFF_LOAD_MORE_COUNT);
    }
  };

  const isDashboardInitialLoading =
    shop === undefined ||
    (shop !== null &&
      (currentUser === undefined ||
        managerLegalConsentStatus === undefined ||
        pendingStaffRequests === undefined ||
        hasPastRecruitments === undefined ||
        recruitments.status === "LoadingFirstPage" ||
        staffs.status === "LoadingFirstPage"));

  if (isDashboardInitialLoading) {
    return (
      <DashboardPageShell>
        <Animation>
          <DashboardContentSkeleton />
        </Animation>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell>
      <Animation>
        <DashboardContent
          shop={shop}
          recruitments={recruitments.results}
          recruitmentGroups={dashboardRecruitmentGroups.groups}
          currentRecruitments={currentRecruitments}
          recruitmentStatus={recruitments.status}
          hasPastRecruitments={hasPastRecruitments ?? false}
          isPastRecruitmentsVisible={isPastRecruitmentsVisible}
          pastRecruitmentStatus={pastRecruitments.status}
          canLoadMorePastRecruitments={canLoadMorePastRecruitments}
          showPastRecruitments={handleShowPastRecruitments}
          loadMorePastRecruitments={handleLoadMorePastRecruitments}
          staffs={staffs.results.slice(0, visibleStaffCount)}
          staffStatus={staffs.status}
          canLoadMoreStaffs={canLoadMoreStaffs}
          loadMoreStaffs={handleLoadMoreStaffs}
          pendingStaffRequests={pendingStaffRequests ?? []}
          notificationFailures={notificationFailures.results}
          announcement={announcement ?? null}
          isDashboardOnboardingDismissed={Boolean(
            currentUser && !currentUser.isNewUser && currentUser.dashboardOnboardingDismissedAt,
          )}
          managerLegalConsentStatus={managerLegalConsentStatus}
          managerProfileDefaults={{
            name: currentUser?.name ?? "",
            email: currentUser?.email ?? "",
          }}
        />
      </Animation>
    </DashboardPageShell>
  );
}

const DashboardPageShell = ({ children }: { children: ReactNode }) => (
  <Box
    minH={{
      base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
      md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
    }}
    bg="white"
  >
    <RootContentWrapper>{children}</RootContentWrapper>
  </Box>
);
