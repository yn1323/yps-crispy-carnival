import { Flex, Spinner } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardContent } from "@/src/components/features/Dashboard/DashboardContent";
import { Animation } from "@/src/components/templates/Animation";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

const RECRUITMENT_PAGE_SIZE = 3;
const STAFF_PAGE_SIZE = 10;

function DashboardPage() {
  const shop = useQuery(api.dashboard.queries.getDashboardShop);
  const skipPagination = shop === undefined || shop === null;
  const recruitments = usePaginatedQuery(api.dashboard.queries.getDashboardRecruitments, skipPagination ? "skip" : {}, {
    initialNumItems: RECRUITMENT_PAGE_SIZE,
  });
  const staffs = usePaginatedQuery(api.dashboard.queries.getDashboardStaffs, skipPagination ? "skip" : {}, {
    initialNumItems: STAFF_PAGE_SIZE,
  });

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
          recruitments={recruitments.results}
          recruitmentStatus={recruitments.status}
          loadMoreRecruitments={() => recruitments.loadMore(RECRUITMENT_PAGE_SIZE)}
          staffs={staffs.results}
          staffStatus={staffs.status}
          loadMoreStaffs={() => staffs.loadMore(STAFF_PAGE_SIZE)}
        />
      </Animation>
    </RootContentWrapper>
  );
}
