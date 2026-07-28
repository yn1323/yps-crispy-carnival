import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { StaffNotificationHistory } from "@/src/components/features/StaffNotificationHistory";
import { clearRequestedShopSearch } from "@/src/lib/authenticatedSearch";
import { featureVisibilityAtom } from "@/src/stores/user";
import { getUserDetailBackDestination, getUserDetailRemovedDestination, mergeUserDetailSearch } from "./navigation";
import type { UserDetailData, UserDetailPanel, UserDetailReturnTo } from "./types";
import { UserDetailView } from "./UserDetailView";
import { useUserLineActions } from "./useUserLineActions";
import { useUserManagerActions } from "./useUserManagerActions";
import { useUserMembershipActions } from "./useUserMembershipActions";
import { useUserNotificationActions } from "./useUserNotificationActions";
import { useUserProfileUpdate } from "./useUserProfileUpdate";

type Props = {
  data: UserDetailData;
  selectedShopId: string | null;
  activePanel?: UserDetailPanel;
  returnTo: UserDetailReturnTo;
  returnShopId?: string;
  returnShopTo?: "dashboard";
  visibleUserCount: number;
};

export function UserDetail({
  data,
  selectedShopId,
  activePanel,
  returnTo,
  returnShopId,
  returnShopTo,
  visibleUserCount,
}: Props) {
  const navigate = useNavigate();
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const showShopMembershipAddition = featureVisibility.shopMembershipAddition;
  const showShopMembershipAdditionRef = useRef(showShopMembershipAddition);
  showShopMembershipAdditionRef.current = showShopMembershipAddition;
  const activePanelRef = useRef(activePanel);
  activePanelRef.current = activePanel;
  const visibleTargetRef = useRef({ personId: data.person.id, selectedShopId });
  visibleTargetRef.current = { personId: data.person.id, selectedShopId };
  const selectedMembership = data.memberships.find((membership) => membership.shopId === selectedShopId) ?? null;
  const selectedShop = data.shops.find((shop) => shop.shopId === selectedShopId) ?? null;
  const isStoreReadOnly = !data.canWrite || Boolean(selectedShop && selectedShop.shopStatus !== "active");
  const isShopPanelOpen = activePanel === "shop" && selectedMembership !== null;

  const profile = useUserProfileUpdate({ data, selectedShopId });
  const notifications = useUserNotificationActions({
    membership: selectedMembership,
    enabled: isShopPanelOpen,
    isReadOnly: isStoreReadOnly,
  });
  const line = useUserLineActions({ membership: selectedMembership, isReadOnly: isStoreReadOnly });
  const membership = useUserMembershipActions({
    membership: selectedMembership,
    selectedShopId,
    isReadOnly: isStoreReadOnly,
    canAddMembership: data.canWrite && showShopMembershipAddition,
  });
  const manager = useUserManagerActions({
    data,
    selectedShopId,
    onPersonRemoved: (removedPersonId) => {
      if (visibleTargetRef.current.personId !== removedPersonId) return;
      if (data.isSelf) {
        void navigate({ to: "/dashboard", search: clearRequestedShopSearch(), replace: true });
        return;
      }
      const destination = getUserDetailRemovedDestination(
        returnTo,
        selectedShopId,
        visibleUserCount,
        returnShopId,
        returnShopTo,
      );
      void navigate({ ...destination, replace: true });
    },
  });

  const updateSearch = (next: { shop?: string; panel?: UserDetailPanel }) => {
    if ("panel" in next) activePanelRef.current = next.panel;
    void navigate({
      to: ".",
      search: (previous) => mergeUserDetailSearch(previous, next),
      replace: true,
      resetScroll: false,
    });
  };

  const handleBack = () => {
    const destination = getUserDetailBackDestination(
      returnTo,
      selectedShopId,
      visibleUserCount,
      data.person.id,
      returnShopId,
      returnShopTo,
    );
    void navigate({ ...destination, replace: true });
  };

  const handleClosePanel = () => {
    membership.onCloseDialog();
    manager.onCloseDialog();
    manager.onCancelManagerAssignment();
    line.onReset();
    updateSearch({ panel: undefined });
  };

  return (
    <UserDetailView
      data={data}
      showShopMembershipAddition={showShopMembershipAddition}
      selectedShopId={selectedShopId}
      activePanel={activePanel}
      notificationHistory={
        selectedMembership ? (
          <StaffNotificationHistory staffId={selectedMembership.staffId} enabled={isShopPanelOpen} />
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
          addingShopId: membership.addingShopId,
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
        onOpenBasic: () => updateSearch({ panel: "basic" }),
        onOpenAddShop: () => {
          if (!showShopMembershipAdditionRef.current) return;
          updateSearch({ panel: "addShop" });
        },
        onOpenShop: (shopId) => updateSearch({ shop: shopId, panel: "shop" }),
        onClosePanel: handleClosePanel,
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
        onAddMembership: async (shopId) => {
          if (!showShopMembershipAdditionRef.current) return;
          const personId = data.person.id;
          const added = await membership.onAddMembership(data.person.id, shopId);
          if (added && activePanelRef.current === "addShop" && visibleTargetRef.current.personId === personId) {
            handleClosePanel();
          }
        },
        onRequestRemoveMembership: membership.onRequestRemoveMembership,
        onConfirmRemoveMembership: async () => {
          const target = { personId: data.person.id, selectedShopId };
          const removed = await membership.onConfirmRemoveMembership();
          if (
            removed &&
            activePanelRef.current === "shop" &&
            visibleTargetRef.current.personId === target.personId &&
            visibleTargetRef.current.selectedShopId === target.selectedShopId
          ) {
            handleClosePanel();
          }
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
export type { UserDetailData, UserDetailPanel, UserDetailReturnTo } from "./types";
export { UserDetailSkeleton } from "./UserDetailSkeleton";
export { UserDetailView } from "./UserDetailView";
