import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
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
import { useUserLineActions } from "./useUserLineActions";
import { useUserMembershipActions } from "./useUserMembershipActions";
import { useUserProfileUpdate } from "./useUserProfileUpdate";
import { useUserRemovalActions } from "./useUserRemovalActions";

type Props = {
  data: UserDetailData;
  selectedShopId: string | null;
  activePanel?: UserDetailPanel;
  returnTo: UserDetailReturnTo;
  returnShopId?: string;
  returnShopTo?: "dashboard";
  visibleUserCount: number;
  appOrganizationId?: Id<"organizations">;
};

export function UserDetail({
  data,
  selectedShopId,
  activePanel,
  returnTo,
  returnShopId,
  returnShopTo,
  visibleUserCount,
  appOrganizationId,
}: Props) {
  const navigate = useNavigate();
  const [appPanel, setAppPanel] = useState<UserDetailPanel>();
  const resolvedActivePanel = appOrganizationId ? appPanel : activePanel;
  const appDetailScope = appOrganizationId ? `${appOrganizationId}:${data.person.id}` : undefined;
  useEffect(() => {
    if (appDetailScope) setAppPanel(undefined);
  }, [appDetailScope]);
  const featureVisibility = useAtomValue(featureVisibilityAtom);
  const showShopMembershipAddition = featureVisibility.shopMembershipAddition;
  const showShopMembershipAdditionRef = useRef(showShopMembershipAddition);
  showShopMembershipAdditionRef.current = showShopMembershipAddition;
  const activePanelRef = useRef(resolvedActivePanel);
  activePanelRef.current = resolvedActivePanel;
  const visiblePersonIdRef = useRef(data.person.id);
  visiblePersonIdRef.current = data.person.id;

  const operationShopId = selectedShopId ?? (appOrganizationId ? data.line.actionShopId : null);
  const profile = useUserProfileUpdate({
    data,
    selectedShopId: operationShopId,
    expectedOrganizationId: appOrganizationId,
  });
  const line = useUserLineActions({ data, expectedOrganizationId: appOrganizationId });
  const membership = useUserMembershipActions({
    canChangeMembership: data.canWrite && showShopMembershipAddition,
    expectedOrganizationId: appOrganizationId,
  });
  const removal = useUserRemovalActions({
    data,
    selectedShopId: operationShopId,
    expectedOrganizationId: appOrganizationId,
    onPersonRemoved: (removedPersonId) => {
      if (visiblePersonIdRef.current !== removedPersonId) return;
      if (data.isSelf) {
        void navigate(
          appOrganizationId
            ? { to: "/app/home", search: {}, replace: true }
            : { to: "/dashboard", search: clearRequestedShopSearch(), replace: true },
        );
        return;
      }
      if (appOrganizationId) {
        void navigate({ to: "/app/staff", search: { org: appOrganizationId }, replace: true });
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
    if (appOrganizationId) {
      setAppPanel(next.panel);
      return;
    }
    void navigate({
      to: ".",
      search: (previous) => mergeUserDetailSearch(previous, next),
      replace: true,
      resetScroll: false,
    });
  };

  const handleBack = () => {
    if (appOrganizationId) {
      void navigate({ to: "/app/staff", search: { org: appOrganizationId }, replace: true });
      return;
    }
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
    updateSearch({ panel: undefined });
  };

  const managerSettingsShopId =
    operationShopId ?? data.shops.find((shop) => shop.shopStatus === "active")?.shopId ?? data.shops[0]?.shopId;

  return (
    <UserDetailView
      data={data}
      showShopMembershipAddition={showShopMembershipAddition}
      managerSettingsDisabledReason={
        managerSettingsShopId ? undefined : "操作できる店舗がないため、管理者設定を開けません。"
      }
      activePanel={resolvedActivePanel}
      state={{
        isUpdatingProfile: profile.isUpdating,
        line: {
          authorizeUrl: line.authorizeUrl,
          showQr: line.showQr,
          isQrLoading: line.isQrLoading,
          isSendingInvite: line.isSendingInvite,
          isDisconnecting: line.isDisconnecting,
        },
        membership: {
          isChanging: membership.isChangingMemberships,
        },
        removal: {
          dialog: removal.dialog,
          isRemoving: removal.isRemoving,
        },
      }}
      actions={{
        onBack: handleBack,
        onOpenBasic: () => updateSearch({ panel: "basic" }),
        onOpenLine: () => updateSearch({ panel: "line" }),
        onOpenAddShop: () => {
          if (!showShopMembershipAdditionRef.current) return;
          updateSearch({ panel: "addShop" });
        },
        onOpenShop: (targetShopId) => {
          if (appOrganizationId) {
            void navigate({
              to: "/app/staff/$personId/shops/$shopId",
              params: { personId: data.person.id, shopId: targetShopId },
              search: { org: appOrganizationId },
            });
            return;
          }
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
        onShowLineQr: line.onShowQr,
        onSendLineInvite: line.onSendInvite,
        onDisconnectLine: line.onDisconnect,
        onChangeMemberships: async (input) => {
          if (!showShopMembershipAdditionRef.current) return;
          const personId = data.person.id;
          const changed = await membership.onChangeMemberships(personId, input);
          if (changed && activePanelRef.current === "addShop" && visiblePersonIdRef.current === personId) {
            handleClosePanel();
          }
        },
        onManageManagers: () => {
          if (appOrganizationId) {
            void navigate({ to: "/app/manage/managers", search: { org: appOrganizationId } });
            return;
          }
          if (!managerSettingsShopId) return;
          void navigate({ to: "/settings/managers", search: { shop: managerSettingsShopId } });
        },
        onRequestRemovePerson: removal.onRequestRemovePerson,
        onConfirmRemovePerson: async () => {
          await removal.onConfirmRemoval();
        },
        onCloseRemovalDialog: removal.onCloseDialog,
      }}
    />
  );
}

export { getUserDetailBackDestination, getUserShopDetailBackDestination } from "./navigation";
export type { UserDetailData, UserDetailPanel, UserDetailReturnTo } from "./types";
export { UserDetailSkeleton } from "./UserDetailSkeleton";
export { UserDetailView } from "./UserDetailView";
