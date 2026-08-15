import { useNavigate, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { featureVisibilityAtom } from "@/src/stores/user";
import type { UserDetailData, UserDetailPanel } from "./types";
import { UserDetailView } from "./UserDetailView";
import { useUserLineActions } from "./useUserLineActions";
import { useUserMembershipActions } from "./useUserMembershipActions";
import { useUserProfileUpdate } from "./useUserProfileUpdate";
import { useUserRemovalActions } from "./useUserRemovalActions";

type Props = {
  data: UserDetailData;
  organizationId: Id<"organizations">;
};

export function UserDetail({ data, organizationId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const [appPanel, setAppPanel] = useState<UserDetailPanel>();
  const resolvedActivePanel = appPanel;
  const appDetailScope = `${organizationId}:${data.person.id}`;
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

  const operationShopId = data.line.actionShopId;
  const profile = useUserProfileUpdate({
    data,
    selectedShopId: operationShopId,
    expectedOrganizationId: organizationId,
  });
  const line = useUserLineActions({ data, expectedOrganizationId: organizationId });
  const membership = useUserMembershipActions({
    canChangeMembership: data.canWrite && showShopMembershipAddition,
    expectedOrganizationId: organizationId,
  });
  const removal = useUserRemovalActions({
    data,
    selectedShopId: operationShopId,
    expectedOrganizationId: organizationId,
    onPersonRemoved: (removedPersonId) => {
      if (visiblePersonIdRef.current !== removedPersonId) return;
      if (data.isSelf) {
        void navigate({ to: "/dashboard", search: {}, replace: true });
        return;
      }
      void navigate({ to: "/app/staff", search: { org: organizationId }, replace: true });
    },
  });

  const updateSearch = (next: { panel?: UserDetailPanel }) => {
    if ("panel" in next) activePanelRef.current = next.panel;
    setAppPanel(next.panel);
  };

  const handleBack = () => {
    router.history.back();
  };

  const handleClosePanel = () => {
    updateSearch({ panel: undefined });
  };

  return (
    <UserDetailView
      data={data}
      showShopMembershipAddition={showShopMembershipAddition}
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
          void navigate({
            to: "/app/staff/$personId/shops/$shopId",
            params: { personId: data.person.id, shopId: targetShopId },
            search: { org: organizationId },
          });
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
        onRequestRemovePerson: removal.onRequestRemovePerson,
        onConfirmRemovePerson: async () => {
          await removal.onConfirmRemoval();
        },
        onCloseRemovalDialog: removal.onCloseDialog,
      }}
    />
  );
}

export type { UserDetailData, UserDetailPanel } from "./types";
export { UserDetailSkeleton } from "./UserDetailSkeleton";
export { UserDetailView } from "./UserDetailView";
