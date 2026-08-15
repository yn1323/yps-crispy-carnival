import { type ComponentProps, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DashboardRecruitmentGroup } from "@/src/components/features/Dashboard/types";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
import { OrganizationRecruitmentManagementView } from "./OrganizationRecruitmentManagementView";

const PAST_RECRUITMENT_PAGE_SIZE = 5;

type ViewProps = ComponentProps<typeof OrganizationRecruitmentManagementView>;

type Props = Omit<
  ViewProps,
  | "groups"
  | "pastStatus"
  | "hasPastRecruitments"
  | "isPastRecruitmentsVisible"
  | "canLoadMorePastRecruitments"
  | "showPastFilterHint"
  | "onShowPastRecruitments"
  | "onLoadMorePastRecruitments"
> & {
  organizationId: Id<"organizations">;
  shopFilter: "all" | Id<"shops">;
  groups: DashboardRecruitmentGroup[];
};

export function OrganizationRecruitmentPastConnection({ organizationId, shopFilter, groups, ...viewProps }: Props) {
  const filteredShop = shopFilter === "all" ? undefined : viewProps.shops.find((shop) => shop.shopId === shopFilter);

  if (!filteredShop) {
    return (
      <OrganizationRecruitmentManagementView
        {...viewProps}
        groups={groups}
        pastStatus="Exhausted"
        hasPastRecruitments={false}
        isPastRecruitmentsVisible={false}
        canLoadMorePastRecruitments={false}
        showPastFilterHint={shopFilter === "all" && viewProps.shops.some((shop) => shop.hasPastRecruitments)}
        onShowPastRecruitments={() => {}}
        onLoadMorePastRecruitments={() => {}}
      />
    );
  }

  return (
    <ManagerShopScopeProvider
      key={filteredShop.shopId}
      shopId={filteredShop.shopId}
      expectedOrganizationId={organizationId}
    >
      <FilteredShopPastRecruitments
        groups={groups}
        hasPastRecruitments={filteredShop.hasPastRecruitments}
        {...viewProps}
      />
    </ManagerShopScopeProvider>
  );
}

type FilteredShopPastRecruitmentsProps = Omit<Props, "organizationId" | "shopFilter"> & {
  hasPastRecruitments: boolean;
};

function FilteredShopPastRecruitments({
  groups,
  hasPastRecruitments,
  ...viewProps
}: FilteredShopPastRecruitmentsProps) {
  const [isPastRecruitmentsVisible, setIsPastRecruitmentsVisible] = useState(false);
  const pastRecruitments = useShopPaginatedQuery(
    api.dashboard.queries.getDashboardPastRecruitments,
    isPastRecruitmentsVisible ? {} : "skip",
    { initialNumItems: PAST_RECRUITMENT_PAGE_SIZE },
  );
  const groupsWithPast: DashboardRecruitmentGroup[] =
    isPastRecruitmentsVisible && pastRecruitments.results.length > 0
      ? [
          ...groups,
          {
            key: "past",
            title: "過去のシフト",
            recruitments: pastRecruitments.results,
            totalCount: pastRecruitments.results.length,
          },
        ]
      : groups;
  const canLoadMorePastRecruitments =
    isPastRecruitmentsVisible &&
    (pastRecruitments.status === "CanLoadMore" || pastRecruitments.status === "LoadingMore");

  return (
    <OrganizationRecruitmentManagementView
      {...viewProps}
      groups={groupsWithPast}
      pastStatus={pastRecruitments.status}
      hasPastRecruitments={hasPastRecruitments}
      isPastRecruitmentsVisible={isPastRecruitmentsVisible}
      canLoadMorePastRecruitments={canLoadMorePastRecruitments}
      showPastFilterHint={false}
      onShowPastRecruitments={() => setIsPastRecruitmentsVisible(true)}
      onLoadMorePastRecruitments={() => pastRecruitments.loadMore(PAST_RECRUITMENT_PAGE_SIZE)}
    />
  );
}
