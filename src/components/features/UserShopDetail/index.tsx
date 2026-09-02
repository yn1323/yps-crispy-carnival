import type { Id } from "@/convex/_generated/dataModel";
import { StaffNotificationHistory } from "@/src/components/features/StaffNotificationHistory";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";
import { UserShopDetailView } from "./UserShopDetailView";
import { useUserShopMembershipActions } from "./useUserShopMembershipActions";
import { useUserShopNotificationActions } from "./useUserShopNotificationActions";

type Props = {
  data: UserShopDetailData;
  membership: UserShopDetailMembership;
  targetShopId: Id<"shops">;
  expectedOrganizationId?: Id<"organizations">;
  onBack: () => void;
};

export function UserShopDetail({ data, membership, targetShopId, expectedOrganizationId, onBack }: Props) {
  const isStoreReadOnly = !data.canWrite;
  const storeDisabledReason = getStoreDisabledReason(data);
  const notifications = useUserShopNotificationActions({
    targetShopId,
    membership,
    isReadOnly: isStoreReadOnly,
    enabled: true,
    expectedOrganizationId,
  });
  const membershipActions = useUserShopMembershipActions({
    targetShopId,
    membership,
    isReadOnly: isStoreReadOnly,
    expectedOrganizationId,
  });
  const viewMembership =
    membership.excludedFromShift === membershipActions.excludedFromShift
      ? membership
      : { ...membership, excludedFromShift: membershipActions.excludedFromShift };

  return (
    <UserShopDetailView
      data={data}
      membership={viewMembership}
      isStoreReadOnly={isStoreReadOnly}
      storeDisabledReason={storeDisabledReason}
      notificationHistory={
        <StaffNotificationHistory
          shopId={targetShopId}
          staffId={membership.staffId}
          enabled
          lineConnectionStatus={data.line.status === "unlinked" ? "unlinked" : "linked"}
          expectedOrganizationId={expectedOrganizationId}
        />
      }
      state={{
        notifications: {
          isLoading: notifications.isLoading,
          openRecruitments: notifications.openRecruitments,
          currentRecruitments: notifications.currentRecruitments,
          isSendingRecruitments: notifications.isSendingRecruitments,
          isSendingCurrentShift: notifications.isSendingCurrentShift,
          isCooldownLoading: notifications.isCooldownLoading,
          isRecruitmentCooldownActive: notifications.isRecruitmentCooldownActive,
          isCurrentShiftCooldownActive: notifications.isCurrentShiftCooldownActive,
        },
        membership: {
          isChangingShiftTarget: membershipActions.isChangingShiftTarget,
        },
      }}
      actions={{
        onBack,
        onSendRecruitments: notifications.sendRecruitments,
        onSendCurrentShift: notifications.sendCurrentShift,
        onChangeShiftTarget: membershipActions.onChangeShiftTarget,
      }}
    />
  );
}

function getStoreDisabledReason(data: UserShopDetailData) {
  if (!data.canWrite) return data.writeDisabledReason ?? "現在、この組織の情報を変更できません。";
  return undefined;
}

export type { UserShopDetailData, UserShopDetailMembership } from "./types";
export { UserShopDetailSkeleton } from "./UserShopDetailSkeleton";
export { UserShopDetailView } from "./UserShopDetailView";
