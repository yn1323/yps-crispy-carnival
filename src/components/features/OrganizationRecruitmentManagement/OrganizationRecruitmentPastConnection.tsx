import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  APP_ORGANIZATION_PAST_RECRUITMENT_PREVIEW_LIMIT,
  APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE,
} from "@/convex/constants";
import type { DashboardRecruitmentGroup, Recruitment } from "@/src/components/features/Dashboard/types";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
import { OrganizationRecruitmentManagementView } from "./OrganizationRecruitmentManagementView";
import type { OrganizationRecruitmentShopMetadata } from "./types";

const PAST_RECRUITMENT_PAGE_SIZE = 5;

type ViewProps = ComponentProps<typeof OrganizationRecruitmentManagementView>;

type Props = Omit<
  ViewProps,
  | "groups"
  | "pastStatus"
  | "hasPastRecruitments"
  | "isPastRecruitmentsVisible"
  | "canLoadMorePastRecruitments"
  | "pastListNotice"
  | "onShowPastRecruitments"
  | "onLoadMorePastRecruitments"
> & {
  organizationId: Id<"organizations">;
  shopFilter: "all" | Id<"shops">;
  isSingleShop: boolean;
  groups: DashboardRecruitmentGroup[];
};

export function OrganizationRecruitmentPastConnection({
  organizationId,
  shopFilter,
  isSingleShop,
  groups,
  ...viewProps
}: Props) {
  const filteredShop =
    shopFilter === "all"
      ? isSingleShop
        ? viewProps.shops[0]
        : undefined
      : viewProps.shops.find((shop) => shop.shopId === shopFilter);

  if (shopFilter === "all" && !filteredShop) {
    return (
      <AllShopsPastRecruitments key={organizationId} organizationId={organizationId} groups={groups} {...viewProps} />
    );
  }

  if (!filteredShop) {
    return (
      <OrganizationRecruitmentManagementView
        {...viewProps}
        groups={groups}
        pastStatus="Exhausted"
        hasPastRecruitments={false}
        isPastRecruitmentsVisible={false}
        canLoadMorePastRecruitments={false}
        pastListNotice={undefined}
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

type OrganizationPastRecruitmentPreviewSection = FunctionReturnType<
  typeof api.appOrganization.queries.listOrganizationPastRecruitmentPreviews
>["page"][number];

type AllShopsPastRecruitmentsProps = Omit<Props, "shopFilter" | "isSingleShop">;

function AllShopsPastRecruitments({ organizationId, groups, ...viewProps }: AllShopsPastRecruitmentsProps) {
  const [isPastRecruitmentsVisible, setIsPastRecruitmentsVisible] = useState(false);
  const previewSections = usePaginatedQuery(
    api.appOrganization.queries.listOrganizationPastRecruitmentPreviews,
    isPastRecruitmentsVisible ? { organizationId } : "skip",
    { initialNumItems: APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE },
  );

  useEffect(() => {
    if (isPastRecruitmentsVisible && previewSections.status === "CanLoadMore") {
      previewSections.loadMore(APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE);
    }
  }, [isPastRecruitmentsVisible, previewSections.loadMore, previewSections.status]);

  const isPreviewReady = isPastRecruitmentsVisible && previewSections.status === "Exhausted";
  const preview = useMemo(
    () => buildAllShopsPastPreview(isPreviewReady ? previewSections.results : []),
    [isPreviewReady, previewSections.results],
  );
  const groupsWithPast = preview.group ? [...groups.filter((group) => group.key !== "past"), preview.group] : groups;
  const getRecruitmentShop = useCallback(
    (recruitment: Recruitment) =>
      preview.recruitmentShops.get(recruitment._id) ?? viewProps.getRecruitmentShop(recruitment),
    [preview.recruitmentShops, viewProps.getRecruitmentShop],
  );
  const unavailablePastRecruitment = preview.group?.recruitments.find((recruitment) => {
    const targetShop = preview.recruitmentShops.get(recruitment._id);
    return !targetShop || !viewProps.shops.some((shop) => shop.shopId === targetShop.shopId && shop.canCreate);
  });
  const unavailablePastShop = unavailablePastRecruitment
    ? preview.recruitmentShops.get(unavailablePastRecruitment._id)
    : undefined;
  const unavailablePastShopReason = unavailablePastShop
    ? viewProps.shops.find((shop) => shop.shopId === unavailablePastShop.shopId)?.createDisabledReason
    : undefined;
  const canDeleteRecruitments = viewProps.canDeleteRecruitments && unavailablePastRecruitment === undefined;
  const deleteDisabledReason = canDeleteRecruitments
    ? undefined
    : (viewProps.deleteDisabledReason ??
      unavailablePastShopReason ??
      "対象店舗を確認できない募集があるため、削除できません。");

  return (
    <OrganizationRecruitmentManagementView
      {...viewProps}
      groups={groupsWithPast}
      canDeleteRecruitments={canDeleteRecruitments}
      deleteDisabledReason={deleteDisabledReason}
      pastStatus={isPastRecruitmentsVisible && !isPreviewReady ? "LoadingFirstPage" : "Exhausted"}
      hasPastRecruitments={viewProps.shops.some((shop) => shop.hasPastRecruitments)}
      isPastRecruitmentsVisible={isPastRecruitmentsVisible}
      canLoadMorePastRecruitments={false}
      pastListNotice={
        preview.hasMoreRecruitments
          ? `直近${APP_ORGANIZATION_PAST_RECRUITMENT_PREVIEW_LIMIT}件を表示しています。さらに過去を見るには、店舗で絞り込んでください。`
          : undefined
      }
      getRecruitmentShop={getRecruitmentShop}
      onShowPastRecruitments={() => setIsPastRecruitmentsVisible(true)}
      onLoadMorePastRecruitments={() => {}}
    />
  );
}

function buildAllShopsPastPreview(sections: readonly OrganizationPastRecruitmentPreviewSection[]) {
  const recruitmentsById = new Map<Recruitment["_id"], Recruitment>();
  const recruitmentShops = new Map<Recruitment["_id"], OrganizationRecruitmentShopMetadata>();

  for (const section of sections) {
    for (const recruitment of section.recruitments) {
      recruitmentsById.set(recruitment._id, recruitment);
      recruitmentShops.set(recruitment._id, section.shop);
    }
  }

  const recruitments = [...recruitmentsById.values()]
    .sort(
      (a, b) =>
        b.periodEnd.localeCompare(a.periodEnd) ||
        b.createdAt - a.createdAt ||
        String(b._id).localeCompare(String(a._id)),
    )
    .slice(0, APP_ORGANIZATION_PAST_RECRUITMENT_PREVIEW_LIMIT);

  return {
    group:
      recruitments.length > 0
        ? ({
            key: "past",
            title: "過去のシフト",
            recruitments,
            totalCount: recruitments.length,
          } satisfies DashboardRecruitmentGroup)
        : undefined,
    recruitmentShops,
    hasMoreRecruitments:
      sections.some((section) => section.hasMoreRecruitments) ||
      recruitmentsById.size > APP_ORGANIZATION_PAST_RECRUITMENT_PREVIEW_LIMIT,
  };
}

type FilteredShopPastRecruitmentsProps = Omit<Props, "organizationId" | "shopFilter" | "isSingleShop"> & {
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
      pastListNotice={undefined}
      onShowPastRecruitments={() => setIsPastRecruitmentsVisible(true)}
      onLoadMorePastRecruitments={() => pastRecruitments.loadMore(PAST_RECRUITMENT_PAGE_SIZE)}
    />
  );
}
