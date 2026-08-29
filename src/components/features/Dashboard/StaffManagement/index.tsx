import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { DEFAULT_USER_LIST_COUNT, USER_LIST_PAGE_SIZE } from "@/src/lib/userListSearch";
import type { PaginationStatus, Staff } from "../types";
import { StaffManagementView } from "./StaffManagementView";
import { useStaffInvitation } from "./useStaffInvitation";

export type StaffManagementData = {
  staffs: Staff[];
  status?: PaginationStatus;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
};

export type StaffManagementState = {
  isInitialLoading: boolean;
  staffs: Staff[];
  content: ReactNode;
};

type Props = {
  data?: StaffManagementData;
  isReadOnly?: boolean;
  organizationShopCount?: number;
  initialVisibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
  onOpenStaffDetail?: (personId: Id<"organizationPeople">, visibleUserCount: number) => void;
  onOpenBillingSettings?: () => void;
  children: (state: StaffManagementState) => ReactNode;
};

export function StaffManagement({
  data,
  isReadOnly = false,
  organizationShopCount,
  initialVisibleUserCount = DEFAULT_USER_LIST_COUNT,
  focusedPersonId,
  onVisibleUserCountChange,
  onOpenStaffDetail,
  onOpenBillingSettings,
  children,
}: Props) {
  const [visibleStaffCount, setVisibleStaffCount] = useState(initialVisibleUserCount);
  const staffOrderScope = useShopQuery(api.dashboard.queries.getDashboardStaffOrderScope, data ? "skip" : {});
  const orderRevision = staffOrderScope?.mode === "ordered" ? staffOrderScope.revision : null;
  const staffQuery = useShopPaginatedQuery(
    api.dashboard.queries.getDashboardStaffs,
    data || staffOrderScope === undefined ? "skip" : { orderRevision },
    {
      initialNumItems: initialVisibleUserCount + 1,
    },
  );

  useEffect(() => {
    setVisibleStaffCount(initialVisibleUserCount);
  }, [initialVisibleUserCount]);

  const queryStaffs = staffQuery.results.slice(0, visibleStaffCount);
  const staffs =
    data?.staffs ?? (staffOrderScope?.mode === "legacy" ? sortManagersFirstStable(queryStaffs) : queryStaffs);
  const status = data?.status ?? staffQuery.status;
  const canLoadMore =
    data?.canLoadMore ??
    (staffQuery.results.length > visibleStaffCount ||
      staffQuery.status === "CanLoadMore" ||
      staffQuery.status === "LoadingMore");

  const handleLoadMore =
    data?.onLoadMore ??
    (() => {
      const nextVisibleCount = visibleStaffCount + USER_LIST_PAGE_SIZE;
      setVisibleStaffCount(nextVisibleCount);
      onVisibleUserCountChange?.(nextVisibleCount);
      if (staffQuery.status === "CanLoadMore" && staffQuery.results.length <= nextVisibleCount) {
        staffQuery.loadMore(USER_LIST_PAGE_SIZE);
      }
    });

  const showOrganizationPeopleAddition = organizationShopCount === undefined || organizationShopCount > 1;
  const invitation = useStaffInvitation(isReadOnly, showOrganizationPeopleAddition, onOpenBillingSettings);
  const handleOpenDetail = (staff: Staff) => {
    onOpenStaffDetail?.(staff.organizationPersonId, visibleStaffCount);
  };

  const content = (
    <StaffManagementView
      staffs={staffs}
      status={status}
      canLoadMore={canLoadMore}
      onLoadMore={handleLoadMore}
      focusedPersonId={focusedPersonId}
      onOpenDetail={handleOpenDetail}
      isReadOnly={isReadOnly}
      invitation={invitation}
    />
  );

  return children({
    isInitialLoading: status === "LoadingFirstPage",
    staffs,
    content,
  });
}

function sortManagersFirstStable(staffs: Staff[]): Staff[] {
  return staffs
    .map((staff, index) => ({ staff, index }))
    .sort((left, right) => Number(right.staff.isManager) - Number(left.staff.isManager) || left.index - right.index)
    .map(({ staff }) => staff);
}
