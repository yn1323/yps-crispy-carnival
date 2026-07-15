import { type ReactNode, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useShopPaginatedQuery } from "@/src/hooks/useShopPaginatedQuery";
import type { PaginationStatus, Recruitment, Staff } from "../types";
import { StaffManagementView } from "./StaffManagementView";
import { useStaffInvitation } from "./useStaffInvitation";
import { useStaffLineConnection } from "./useStaffLineConnection";
import { useStaffNotificationDelivery } from "./useStaffNotificationDelivery";
import { useStaffProfileManagement } from "./useStaffProfileManagement";

const STAFF_INITIAL_VISIBLE_COUNT = 10;
const STAFF_LOAD_MORE_COUNT = 10;
const STAFF_QUERY_PAGE_SIZE = STAFF_INITIAL_VISIBLE_COUNT + 1;

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
  children: (state: StaffManagementState) => ReactNode;
};

export function StaffManagement({ data, openRecruitments, currentRecruitments, children }: Props) {
  const [visibleStaffCount, setVisibleStaffCount] = useState(STAFF_INITIAL_VISIBLE_COUNT);
  const staffQuery = useShopPaginatedQuery(api.dashboard.queries.getDashboardStaffs, data ? "skip" : {}, {
    initialNumItems: STAFF_QUERY_PAGE_SIZE,
  });
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
      const nextVisibleCount = visibleStaffCount + STAFF_LOAD_MORE_COUNT;
      setVisibleStaffCount(nextVisibleCount);
      if (staffQuery.status === "CanLoadMore" && staffQuery.results.length <= nextVisibleCount) {
        staffQuery.loadMore(STAFF_LOAD_MORE_COUNT);
      }
    });

  const invitation = useStaffInvitation();
  const lineConnection = useStaffLineConnection();
  const profile = useStaffProfileManagement(staffs, { onResetDetail: lineConnection.reset });
  const notifications = useStaffNotificationDelivery();

  const content = (
    <StaffManagementView
      staffs={staffs}
      status={status}
      canLoadMore={canLoadMore}
      onLoadMore={handleLoadMore}
      openRecruitments={openRecruitments}
      currentRecruitments={currentRecruitments}
      invitation={invitation}
      detail={{
        staff: profile.staff,
        dialog: profile.dialog,
        onOpen: profile.onOpen,
        onOpenChange: profile.onOpenChange,
        onClose: profile.onClose,
        onEdit: profile.onEdit,
        isEditing: profile.isEditing,
        onDelete: profile.onDelete,
        isDeleting: profile.isDeleting,
        onChangeShiftTarget: profile.onChangeShiftTarget,
        isChangingShiftTarget: profile.isChangingShiftTarget,
        onShowLineQr: lineConnection.onShowQr,
        lineQrState: lineConnection.qrState,
        onSendLineInvite: lineConnection.onSendInvite,
        isSendingLineInvite: lineConnection.isSendingInvite,
        onSendRecruitments: notifications.onSendRecruitments,
        isSendingRecruitments: notifications.isSendingRecruitments,
        onSendCurrentShift: notifications.onSendCurrentShift,
        isSendingCurrentShift: notifications.isSendingCurrentShift,
      }}
    />
  );

  return children({
    isInitialLoading: !data && staffQuery.status === "LoadingFirstPage",
    staffs,
    content,
  });
}
