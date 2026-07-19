import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StaffNotificationHistory } from "@/src/components/features/StaffNotificationHistory";
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
  const [currentTab, setCurrentTab] = useState(activeTab);
  const selectedMembership = data.memberships.find((membership) => membership.shopId === selectedShopId) ?? null;
  const selectedShop = data.shops.find((shop) => shop.shopId === selectedShopId) ?? null;
  const isStoreReadOnly = !data.canWrite || Boolean(selectedShop && selectedShop.shopStatus !== "active");

  const profile = useUserProfileUpdate({ data, selectedShopId });
  const notifications = useUserNotificationActions({
    membership: selectedMembership,
    enabled: currentTab === "notification",
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

  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);

  const updateSearch = (next: { shop?: string; tab?: UserDetailTab }) => {
    void navigate({
      to: ".",
      search: (previous) => mergeUserDetailSearch(previous, next),
      replace: true,
      resetScroll: false,
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
      activeTab={currentTab}
      notificationHistory={
        selectedMembership ? (
          <StaffNotificationHistory staffId={selectedMembership.staffId} enabled={currentTab === "notification"} />
        ) : null
      }
      state={{
        isUpdatingProfile: profile.isUpdating,
        notification: notifications,
        line,
        membership: {
          dialog: membership.dialog,
          isChangingShiftTarget: membership.isChangingShiftTarget,
          isRemoving: membership.isRemovingMembership,
          isAdding: membership.isAddingMembership,
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
        onTabChange: (tab) => {
          setCurrentTab(tab);
          updateSearch({ tab });
        },
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
        onAddMembership: async () => {
          const added = await membership.onAddMembership(data.person.id);
          if (added) {
            setCurrentTab("line");
            updateSearch({ tab: "line" });
          }
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
