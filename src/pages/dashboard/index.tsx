import { Flex, Spinner } from "@chakra-ui/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { DashboardContent } from "@/src/components/features/Dashboard/DashboardContent";
import { Animation } from "@/src/components/templates/Animation";
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
  const staffs = usePaginatedQuery(api.dashboard.queries.getDashboardStaffs, skipPagination ? "skip" : {}, {
    initialNumItems: STAFF_QUERY_PAGE_SIZE,
  });

  const canLoadMoreRecruitments =
    recruitments.results.length > visibleRecruitmentCount ||
    recruitments.status === "CanLoadMore" ||
    recruitments.status === "LoadingMore";
  const canLoadMoreStaffs =
    staffs.results.length > visibleStaffCount || staffs.status === "CanLoadMore" || staffs.status === "LoadingMore";

  const handleLoadMoreRecruitments = () => {
    const nextVisibleCount = visibleRecruitmentCount + RECRUITMENT_LOAD_MORE_COUNT;
    setVisibleRecruitmentCount(nextVisibleCount);
    if (recruitments.status === "CanLoadMore" && recruitments.results.length <= nextVisibleCount) {
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

  if (shop === undefined) {
    return (
      <RootContentWrapper>
        <Flex justify="center" align="center" minH="200px">
          <Spinner />
        </Flex>
      </RootContentWrapper>
    );
  }

  return (
    <RootContentWrapper>
      <Animation>
        <DashboardContent
          shop={shop}
          recruitments={recruitments.results.slice(0, visibleRecruitmentCount)}
          recruitmentStatus={recruitments.status}
          canLoadMoreRecruitments={canLoadMoreRecruitments}
          loadMoreRecruitments={handleLoadMoreRecruitments}
          staffs={staffs.results.slice(0, visibleStaffCount)}
          staffStatus={staffs.status}
          canLoadMoreStaffs={canLoadMoreStaffs}
          loadMoreStaffs={handleLoadMoreStaffs}
          managerLegalConsentStatus={managerLegalConsentStatus}
          ownerProfileDefaults={{
            name: currentUser?.name ?? "",
            email: currentUser?.email ?? "",
          }}
        />
      </Animation>
    </RootContentWrapper>
  );
}
