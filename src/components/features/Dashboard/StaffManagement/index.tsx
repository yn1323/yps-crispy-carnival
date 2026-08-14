import { useAtomValue } from "jotai";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffNotificationHistory } from "@/src/components/features/StaffNotificationHistory";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { DEFAULT_USER_LIST_COUNT, USER_LIST_PAGE_SIZE } from "@/src/lib/userListSearch";
import { useManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import { selectedShopAtom } from "@/src/stores/shop";
import { featureVisibilityAtom } from "@/src/stores/user";
import type { PaginationStatus, Recruitment, Staff } from "../types";
import { StaffManagementView } from "./StaffManagementView";
import { useStaffInvitation } from "./useStaffInvitation";
import { useStaffLineConnection } from "./useStaffLineConnection";
import { useStaffNotificationDelivery } from "./useStaffNotificationDelivery";
import { useStaffProfileManagement } from "./useStaffProfileManagement";

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
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  recruitmentDataStatus?: "ready" | "loading" | "unavailable";
  isReadOnly?: boolean;
  initialVisibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
  onOpenStaffDetail?: (personId: Id<"organizationPeople">, visibleUserCount: number) => void;
  onManageManagers?: () => void;
  onOpenBillingSettings?: () => void;
  children: (state: StaffManagementState) => ReactNode;
};

export function StaffManagement({
  data,
  openRecruitments,
  currentRecruitments,
  recruitmentDataStatus = "ready",
  isReadOnly = false,
  initialVisibleUserCount = DEFAULT_USER_LIST_COUNT,
  focusedPersonId,
  onVisibleUserCountChange,
  onOpenStaffDetail,
  onManageManagers,
  onOpenBillingSettings,
  children,
}: Props) {
  const selectedShop = useAtomValue(selectedShopAtom);
  const managerShopScope = useManagerShopScope();
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const [visibleStaffCount, setVisibleStaffCount] = useState(initialVisibleUserCount);
  const staffQuery = useShopPaginatedQuery(api.dashboard.queries.getDashboardStaffs, data ? "skip" : {}, {
    initialNumItems: initialVisibleUserCount + 1,
  });

  useEffect(() => {
    setVisibleStaffCount(initialVisibleUserCount);
  }, [initialVisibleUserCount]);

  const staffs = data?.staffs ?? staffQuery.results.slice(0, visibleStaffCount);
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

  const invitation = useStaffInvitation(isReadOnly, featureVisibility.shopMembershipAddition, onOpenBillingSettings);
  const lineConnection = useStaffLineConnection(isReadOnly);
  const profile = useStaffProfileManagement(staffs, { onResetDetail: lineConnection.reset, isReadOnly });
  const notifications = useStaffNotificationDelivery(isReadOnly);
  const handleOpenDetail = (staff: Staff) => {
    if (!staff.organizationPersonId) {
      profile.onOpen(staff);
      return;
    }
    onOpenStaffDetail?.(staff.organizationPersonId, visibleStaffCount);
  };

  const content = (
    <StaffManagementView
      staffs={staffs}
      status={status}
      canLoadMore={canLoadMore}
      onLoadMore={handleLoadMore}
      focusedPersonId={focusedPersonId}
      openRecruitments={openRecruitments}
      currentRecruitments={currentRecruitments}
      recruitmentDataStatus={recruitmentDataStatus}
      onOpenDetail={handleOpenDetail}
      isReadOnly={isReadOnly}
      invitation={invitation}
      detail={{
        staff: profile.staff,
        dialog: profile.dialog,
        onOpenChange: profile.onOpenChange,
        onClose: profile.onClose,
        onEdit: profile.onEdit,
        isEditing: profile.isEditing,
        onDelete: profile.onDelete,
        isDeleting: profile.isDeleting,
        onChangeShiftTarget: profile.onChangeShiftTarget,
        isChangingShiftTarget: profile.isChangingShiftTarget,
        onManageManagers: () => {
          onManageManagers?.();
        },
        onShowLineQr: lineConnection.onShowQr,
        lineQrState: lineConnection.qrState,
        onSendLineInvite: lineConnection.onSendInvite,
        isSendingLineInvite: lineConnection.isSendingInvite,
        onSendRecruitments: notifications.onSendRecruitments,
        isSendingRecruitments: notifications.isSendingRecruitments,
        onSendCurrentShift: notifications.onSendCurrentShift,
        isSendingCurrentShift: notifications.isSendingCurrentShift,
        notificationHistory:
          profile.staff && (managerShopScope?.shopId || selectedShop?.shopId) ? (
            <StaffNotificationHistory
              key={profile.staff._id}
              shopId={(managerShopScope?.shopId ?? selectedShop?.shopId) as Id<"shops">}
              staffId={profile.staff._id}
              enabled={profile.dialog.isOpen}
              expectedOrganizationId={managerShopScope?.expectedOrganizationId as Id<"organizations"> | undefined}
            />
          ) : null,
      }}
    />
  );

  return children({
    isInitialLoading: status === "LoadingFirstPage",
    staffs,
    content,
  });
}
