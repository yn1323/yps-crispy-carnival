import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { StaffNotificationHistory } from "@/src/components/features/StaffNotificationHistory";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import { DEFAULT_USER_LIST_COUNT, toUserListCountSearch, USER_LIST_PAGE_SIZE } from "@/src/lib/userListSearch";
import { selectedShopAtom } from "@/src/stores/shop";
import type { PaginationStatus, Recruitment, Staff } from "../types";
import { StaffManagementView } from "./StaffManagementView";
import { useStaffInvitation } from "./useStaffInvitation";
import { useStaffLineConnection } from "./useStaffLineConnection";
import { useStaffManagerInvitation } from "./useStaffManagerInvitation";
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
  isReadOnly?: boolean;
  initialVisibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
  children: (state: StaffManagementState) => ReactNode;
};

export function StaffManagement({
  data,
  openRecruitments,
  currentRecruitments,
  isReadOnly = false,
  initialVisibleUserCount = DEFAULT_USER_LIST_COUNT,
  focusedPersonId,
  onVisibleUserCountChange,
  children,
}: Props) {
  const navigate = useNavigate();
  const selectedShop = useAtomValue(selectedShopAtom);
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

  const invitation = useStaffInvitation(isReadOnly);
  const lineConnection = useStaffLineConnection(isReadOnly);
  const profile = useStaffProfileManagement(staffs, { onResetDetail: lineConnection.reset, isReadOnly });
  const managerInvitation = useStaffManagerInvitation(profile.staff, { isReadOnly });
  const notifications = useStaffNotificationDelivery(isReadOnly);
  const handleOpenDetail = (staff: Staff) => {
    if (!staff.organizationPersonId) {
      profile.onOpen(staff);
      return;
    }
    if (!selectedShop?.shopId) return;
    void navigate({
      to: "/users/$personId",
      params: { personId: staff.organizationPersonId },
      search: {
        shop: selectedShop.shopId,
        returnTo: "dashboard",
        users: toUserListCountSearch(visibleStaffCount),
      },
    });
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
        onInviteManager: managerInvitation.onInvite,
        isInvitingManager: managerInvitation.isInviting,
        onShowLineQr: lineConnection.onShowQr,
        lineQrState: lineConnection.qrState,
        onSendLineInvite: lineConnection.onSendInvite,
        isSendingLineInvite: lineConnection.isSendingInvite,
        onSendRecruitments: notifications.onSendRecruitments,
        isSendingRecruitments: notifications.isSendingRecruitments,
        onSendCurrentShift: notifications.onSendCurrentShift,
        isSendingCurrentShift: notifications.isSendingCurrentShift,
        notificationHistory: profile.staff ? (
          <StaffNotificationHistory
            key={profile.staff._id}
            staffId={profile.staff._id}
            enabled={profile.dialog.isOpen}
          />
        ) : null,
      }}
    />
  );

  return children({
    isInitialLoading: !data && staffQuery.status === "LoadingFirstPage",
    staffs,
    content,
  });
}
