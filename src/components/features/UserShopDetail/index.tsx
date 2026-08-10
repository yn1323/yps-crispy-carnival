import type { Id } from "@/convex/_generated/dataModel";
import { StaffNotificationHistory } from "@/src/components/features/StaffNotificationHistory";
import { useViewportActivation } from "@/src/hooks/useViewportActivation";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";
import { UserShopDetailView } from "./UserShopDetailView";
import { useUserShopLineActions } from "./useUserShopLineActions";
import { useUserShopMembershipActions } from "./useUserShopMembershipActions";
import { useUserShopNotificationActions } from "./useUserShopNotificationActions";

type Props = {
  data: UserShopDetailData;
  membership: UserShopDetailMembership;
  targetShopId: Id<"shops">;
  onBack: () => void;
};

export function UserShopDetail({ data, membership, targetShopId, onBack }: Props) {
  const isStoreReadOnly = !data.canWrite || membership.shopStatus !== "active";
  const storeDisabledReason = getStoreDisabledReason(data, membership);
  const notificationSection = useViewportActivation<HTMLDivElement>({
    activationKey: `${data.person.id}:${targetShopId}:${membership.staffId}`,
  });
  const line = useUserShopLineActions({ targetShopId, membership, isReadOnly: isStoreReadOnly });
  const notifications = useUserShopNotificationActions({
    targetShopId,
    membership,
    isReadOnly: isStoreReadOnly,
    enabled: notificationSection.isActive,
  });
  const membershipActions = useUserShopMembershipActions({
    targetShopId,
    membership,
    isReadOnly: isStoreReadOnly,
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
      notificationSectionRef={notificationSection.ref}
      onNotificationSectionFocus={notificationSection.activate}
      notificationHistory={
        notificationSection.isActive ? (
          <StaffNotificationHistory shopId={targetShopId} staffId={membership.staffId} enabled />
        ) : null
      }
      state={{
        line: {
          authorizeUrl: line.authorizeUrl,
          showQr: line.showQr,
          isQrLoading: line.isQrLoading,
          isSendingInvite: line.isSendingInvite,
        },
        notifications: {
          isLoading: !notificationSection.isActive || notifications.isLoading,
          openRecruitments: notifications.openRecruitments,
          currentRecruitments: notifications.currentRecruitments,
          isSendingRecruitments: notifications.isSendingRecruitments,
          isSendingCurrentShift: notifications.isSendingCurrentShift,
        },
        membership: {
          isChangingShiftTarget: membershipActions.isChangingShiftTarget,
        },
      }}
      actions={{
        onBack,
        onShowLineQr: line.onShowQr,
        onSendLineInvite: line.onSendInvite,
        onSendRecruitments: notifications.sendRecruitments,
        onSendCurrentShift: notifications.sendCurrentShift,
        onChangeShiftTarget: membershipActions.onChangeShiftTarget,
      }}
    />
  );
}

function getStoreDisabledReason(data: UserShopDetailData, membership: UserShopDetailMembership) {
  if (!data.canWrite) return data.writeDisabledReason ?? "現在、この組織の情報を変更できません。";
  if (membership.shopStatus === "archived") return "停止中の店舗では、店舗別設定を変更できません。";
  if (membership.shopStatus === "planSuspended")
    return "契約上限を超えて停止中の店舗では、店舗別設定を変更できません。";
  return undefined;
}

export type { UserShopDetailData, UserShopDetailMembership } from "./types";
export { UserShopDetailSkeleton } from "./UserShopDetailSkeleton";
export { UserShopDetailView } from "./UserShopDetailView";
