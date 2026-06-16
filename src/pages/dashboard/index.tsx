import { Box } from "@chakra-ui/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { type ReactNode, useState } from "react";
import { api } from "@/convex/_generated/api";
import { DashboardContent, DashboardContentSkeleton } from "@/src/components/features/Dashboard/DashboardContent";
import { Animation } from "@/src/components/templates/Animation";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";

const RECRUITMENT_INITIAL_VISIBLE_COUNT = 3;
const RECRUITMENT_LOAD_MORE_COUNT = 3;
const RECRUITMENT_QUERY_PAGE_SIZE = RECRUITMENT_INITIAL_VISIBLE_COUNT + 1;
const STAFF_INITIAL_VISIBLE_COUNT = 10;
const STAFF_LOAD_MORE_COUNT = 10;
const STAFF_QUERY_PAGE_SIZE = STAFF_INITIAL_VISIBLE_COUNT + 1;

export function DashboardPage() {
  const [visibleRecruitmentCount, setVisibleRecruitmentCount] = useState(RECRUITMENT_INITIAL_VISIBLE_COUNT);
  const [visibleStaffCount, setVisibleStaffCount] = useState(STAFF_INITIAL_VISIBLE_COUNT);
  const shop = useQuery(api.dashboard.queries.getDashboardShop);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, {});
  const skipPagination = shop === undefined || shop === null;
  const managerLegalConsentStatus = useQuery(
    api.legal.queries.getManagerConsentStatus,
    shop === undefined || shop === null ? "skip" : {},
  );
  const recruitments = usePaginatedQuery(api.dashboard.queries.getDashboardRecruitments, skipPagination ? "skip" : {}, {
    initialNumItems: RECRUITMENT_QUERY_PAGE_SIZE,
  });
  const currentRecruitments = useQuery(
    api.dashboard.queries.getDashboardCurrentRecruitments,
    skipPagination ? "skip" : {},
  );
  const staffs = usePaginatedQuery(api.dashboard.queries.getDashboardStaffs, skipPagination ? "skip" : {}, {
    initialNumItems: STAFF_QUERY_PAGE_SIZE,
  });
  const pendingStaffRequests = useQuery(
    api.staffRegistration.queries.getPendingRequests,
    shop === undefined || shop === null ? "skip" : {},
  );

  const currentRecruitmentIds = new Set(currentRecruitments?.map((recruitment) => recruitment._id) ?? []);
  const nonCurrentRecruitments = recruitments.results.filter(
    (recruitment) => !currentRecruitmentIds.has(recruitment._id),
  );

  const canLoadMoreRecruitments =
    nonCurrentRecruitments.length > visibleRecruitmentCount ||
    recruitments.status === "CanLoadMore" ||
    recruitments.status === "LoadingMore";
  const canLoadMoreStaffs =
    staffs.results.length > visibleStaffCount || staffs.status === "CanLoadMore" || staffs.status === "LoadingMore";

  const handleLoadMoreRecruitments = () => {
    const nextVisibleCount = visibleRecruitmentCount + RECRUITMENT_LOAD_MORE_COUNT;
    setVisibleRecruitmentCount(nextVisibleCount);
    if (recruitments.status === "CanLoadMore" && nonCurrentRecruitments.length <= nextVisibleCount) {
      recruitments.loadMore(RECRUITMENT_LOAD_MORE_COUNT);
    }
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
        currentRecruitments === undefined ||
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
          recruitments={nonCurrentRecruitments.slice(0, visibleRecruitmentCount)}
          currentRecruitments={currentRecruitments ?? []}
          recruitmentStatus={recruitments.status}
          canLoadMoreRecruitments={canLoadMoreRecruitments}
          loadMoreRecruitments={handleLoadMoreRecruitments}
          staffs={staffs.results.slice(0, visibleStaffCount)}
          staffStatus={staffs.status}
          canLoadMoreStaffs={canLoadMoreStaffs}
          loadMoreStaffs={handleLoadMoreStaffs}
          pendingStaffRequests={pendingStaffRequests ?? []}
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
