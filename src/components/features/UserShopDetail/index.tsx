import { useAtomValue } from "jotai";
import { useRef } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffNotificationHistory } from "@/src/components/features/StaffNotificationHistory";
import { featureVisibilityAtom } from "@/src/stores/user";
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
  onMembershipRemoved: () => void;
};

export function UserShopDetail({ data, membership, targetShopId, onBack, onMembershipRemoved }: Props) {
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const showMembershipRemoval = featureVisibility.shopMembershipAddition;
  const visibleTargetRef = useRef({ personId: data.person.id, targetShopId, staffId: membership.staffId });
  visibleTargetRef.current = { personId: data.person.id, targetShopId, staffId: membership.staffId };
  const isStoreReadOnly = !data.canWrite || membership.shopStatus !== "active";
  const storeDisabledReason = getStoreDisabledReason(data, membership);
  const line = useUserShopLineActions({ targetShopId, membership, isReadOnly: isStoreReadOnly });
  const notifications = useUserShopNotificationActions({
    targetShopId,
    membership,
    isReadOnly: isStoreReadOnly,
  });
  const membershipActions = useUserShopMembershipActions({
    targetShopId,
    membership,
    isReadOnly: isStoreReadOnly,
    canRemoveMembership: showMembershipRemoval,
  });

  const handleConfirmRemoveMembership = async () => {
    const target = visibleTargetRef.current;
    const removed = await membershipActions.onConfirmRemoveMembership();
    const current = visibleTargetRef.current;
    if (
      removed &&
      current.personId === target.personId &&
      current.targetShopId === target.targetShopId &&
      current.staffId === target.staffId
    ) {
      onMembershipRemoved();
    }
  };

  return (
    <UserShopDetailView
      data={data}
      membership={membership}
      isStoreReadOnly={isStoreReadOnly}
      storeDisabledReason={storeDisabledReason}
      showMembershipRemoval={showMembershipRemoval}
      notificationHistory={<StaffNotificationHistory shopId={targetShopId} staffId={membership.staffId} enabled />}
      state={{
        line: {
          authorizeUrl: line.authorizeUrl,
          showQr: line.showQr,
          isQrLoading: line.isQrLoading,
          isSendingInvite: line.isSendingInvite,
        },
        notifications: {
          isLoading: notifications.isLoading,
          openRecruitments: notifications.openRecruitments,
          currentRecruitments: notifications.currentRecruitments,
          isSendingRecruitments: notifications.isSendingRecruitments,
          isSendingCurrentShift: notifications.isSendingCurrentShift,
        },
        membership: {
          isChangingShiftTarget: membershipActions.isChangingShiftTarget,
          isRemovalConfirmationOpen: membershipActions.dialog?.kind === "removeMembership",
          isRemoving: membershipActions.isRemovingMembership,
        },
      }}
      actions={{
        onBack,
        onShowLineQr: line.onShowQr,
        onSendLineInvite: line.onSendInvite,
        onSendRecruitments: notifications.sendRecruitments,
        onSendCurrentShift: notifications.sendCurrentShift,
        onChangeShiftTarget: membershipActions.onChangeShiftTarget,
        onRequestRemoveMembership: membershipActions.onRequestRemoveMembership,
        onCancelRemoveMembership: membershipActions.onCloseDialog,
        onConfirmRemoveMembership: handleConfirmRemoveMembership,
      }}
    />
  );
}

function getStoreDisabledReason(data: UserShopDetailData, membership: UserShopDetailMembership) {
  if (!data.canWrite) return data.writeDisabledReason ?? "現在、このグループの情報を変更できません。";
  if (membership.shopStatus === "archived") return "停止中の店舗では、店舗別設定を変更できません。";
  if (membership.shopStatus === "planSuspended")
    return "契約上限を超えて停止中の店舗では、店舗別設定を変更できません。";
  return undefined;
}

export type { UserShopDetailData, UserShopDetailMembership } from "./types";
export { UserShopDetailSkeleton } from "./UserShopDetailSkeleton";
export { UserShopDetailView } from "./UserShopDetailView";
