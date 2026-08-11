import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { clearRequestedShopSearch } from "@/src/lib/authenticatedSearch";
import { featureVisibilityAtom } from "@/src/stores/user";
import {
  getUserDetailBackDestination,
  getUserDetailRemovedDestination,
  getUserShopDetailDestination,
  mergeUserDetailSearch,
} from "./navigation";
import type { UserDetailData, UserDetailPanel, UserDetailReturnTo } from "./types";
import { UserDetailView } from "./UserDetailView";
import { useUserManagerActions } from "./useUserManagerActions";
import { useUserMembershipActions } from "./useUserMembershipActions";
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
  const visiblePersonIdRef = useRef(data.person.id);
  visiblePersonIdRef.current = data.person.id;

  const profile = useUserProfileUpdate({ data, selectedShopId });
  const membership = useUserMembershipActions({
    canChangeMembership: data.canWrite && showShopMembershipAddition,
  });
  const manager = useUserManagerActions({
    data,
    selectedShopId,
    onPersonRemoved: (removedPersonId) => {
      if (visiblePersonIdRef.current !== removedPersonId) return;
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

  const updateSearch = (next: { panel?: UserDetailPanel }) => {
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
    manager.onCloseDialog();
    manager.onCancelManagerAssignment();
    updateSearch({ panel: undefined });
  };

  return (
    <UserDetailView
      data={data}
      showShopMembershipAddition={showShopMembershipAddition}
      activePanel={activePanel}
      state={{
        isUpdatingProfile: profile.isUpdating,
        membership: {
          isChanging: membership.isChangingMemberships,
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
        onOpenShop: (targetShopId) => {
          const destination = getUserShopDetailDestination(
            data.person.id,
            targetShopId,
            selectedShopId,
            returnTo,
            visibleUserCount,
            returnShopId,
            returnShopTo,
          );
          void navigate(destination);
        },
        onClosePanel: handleClosePanel,
        onUpdateProfile: async (formData) => {
          const updated = await profile.update(formData);
          if (updated && activePanelRef.current === "basic" && visiblePersonIdRef.current === data.person.id) {
            handleClosePanel();
          }
        },
        onChangeMemberships: async (input) => {
          if (!showShopMembershipAdditionRef.current) return;
          const personId = data.person.id;
          const changed = await membership.onChangeMemberships(personId, input);
          if (changed && activePanelRef.current === "addShop" && visiblePersonIdRef.current === personId) {
            handleClosePanel();
          }
        },
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

export { getUserDetailBackDestination, getUserShopDetailBackDestination } from "./navigation";
export type { UserDetailData, UserDetailPanel, UserDetailReturnTo } from "./types";
export { UserDetailSkeleton } from "./UserDetailSkeleton";
export { UserDetailView } from "./UserDetailView";
