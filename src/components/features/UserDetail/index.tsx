import { useNavigate } from "@tanstack/react-router";
import { clearRequestedShopSearch } from "@/src/lib/authenticatedSearch";
import { toUserListCountSearch } from "@/src/lib/userListSearch";
import { getUserDetailBackDestination, mergeUserDetailSearch } from "./navigation";
import type { UserDetailData, UserDetailReturnTo, UserDetailTab } from "./types";
import { UserDetailView } from "./UserDetailView";
import { useUserLineActions } from "./useUserLineActions";
import { useUserManagerActions } from "./useUserManagerActions";
import { useUserMembershipActions } from "./useUserMembershipActions";
import { useUserNotificationActions } from "./useUserNotificationActions";
import { useUserProfileUpdate } from "./useUserProfileUpdate";

type Props = {
  data: UserDetailData;
  selectedShopId: string | null;
  activeTab: UserDetailTab;
  returnTo: UserDetailReturnTo;
  visibleUserCount: number;
};

export function UserDetail({ data, selectedShopId, activeTab, returnTo, visibleUserCount }: Props) {
  const navigate = useNavigate();
  const selectedMembership = data.memberships.find((membership) => membership.shopId === selectedShopId) ?? null;
  const isStoreReadOnly = !data.canWrite || Boolean(selectedMembership && selectedMembership.shopStatus !== "active");

  const profile = useUserProfileUpdate({ data, selectedShopId });
  const notifications = useUserNotificationActions({
    membership: selectedMembership,
    enabled: activeTab === "notification",
    isReadOnly: isStoreReadOnly,
  });
  const line = useUserLineActions({ membership: selectedMembership, isReadOnly: isStoreReadOnly });
  const membership = useUserMembershipActions({
    membership: selectedMembership,
    selectedShopId,
    isReadOnly: isStoreReadOnly,
  });
  const manager = useUserManagerActions({
    data,
    selectedShopId,
    onPersonRemoved: () => {
      if (data.isSelf) {
        void navigate({ to: "/dashboard", search: clearRequestedShopSearch(), replace: true });
        return;
      }
      void navigate({
        to: "/settings",
        search: {
          shop: selectedShopId ?? undefined,
          tab: "people",
          users: toUserListCountSearch(visibleUserCount),
        },
        replace: true,
      });
    },
  });

  const updateSearch = (next: { shop?: string; tab?: UserDetailTab }) => {
    void navigate({
      to: ".",
      search: (previous) => mergeUserDetailSearch(previous, next),
      replace: true,
    });
  };

  const handleBack = () => {
    const destination = getUserDetailBackDestination(returnTo, selectedShopId, visibleUserCount, data.person.id);
    void navigate({ ...destination, replace: true });
  };

  return (
    <UserDetailView
      data={data}
      selectedShopId={selectedShopId}
      activeTab={activeTab}
      state={{
        isUpdatingProfile: profile.isUpdating,
        notification: notifications,
        line,
        membership: {
          dialog: membership.dialog,
          isChangingShiftTarget: membership.isChangingShiftTarget,
          isRemoving: membership.isRemovingMembership,
        },
        manager: {
          dialog: manager.dialog,
          isAssignmentConfirmationOpen: manager.isAssignmentConfirmationOpen,
          isAssigning: manager.isAssigningManager,
          isRemoving: manager.isRemoving,
        },
      }}
      actions={{
        onBack: handleBack,
        onSelectShop: (shopId) => updateSearch({ shop: shopId }),
        onTabChange: (tab) => updateSearch({ tab }),
        onUpdateProfile: async (formData) => {
          await profile.update(formData);
        },
        onSendRecruitments: async () => {
          await notifications.sendRecruitments();
        },
        onSendCurrentShift: async () => {
          await notifications.sendCurrentShift();
        },
        onShowLineQr: async () => {
          await line.onShowQr();
        },
        onSendLineInvite: async () => {
          await line.onSendInvite();
        },
        onChangeShiftTarget: async (isShiftTarget) => {
          await membership.onChangeShiftTarget(isShiftTarget);
        },
        onRequestRemoveMembership: membership.onRequestRemoveMembership,
        onConfirmRemoveMembership: async () => {
          await membership.onConfirmRemoveMembership();
        },
        onCloseMembershipDialog: membership.onCloseDialog,
        onRequestManagerAssignment: manager.onRequestManagerAssignment,
        onCancelManagerAssignment: manager.onCancelManagerAssignment,
        onAssignManager: async () => {
          await manager.onAssignManager();
        },
        onRequestRemoveManagerRole: manager.onRequestRemoveManagerRole,
        onRequestRemovePerson: manager.onRequestRemovePerson,
        onConfirmManagerSetting: async () => {
          await manager.onConfirmRemoval();
        },
        onCloseManagerDialog: manager.onCloseDialog,
      }}
    />
  );
}

export { getUserDetailBackDestination } from "./navigation";
export type { UserDetailData, UserDetailReturnTo, UserDetailTab } from "./types";
export { UserDetailSkeleton } from "./UserDetailSkeleton";
export { UserDetailView } from "./UserDetailView";
