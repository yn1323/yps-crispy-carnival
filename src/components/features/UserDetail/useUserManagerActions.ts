import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserDetailData, UserDetailDialog } from "./types";

export function useUserManagerActions({
  data,
  selectedShopId,
  onPersonRemoved,
}: {
  data: UserDetailData;
  selectedShopId: string | null;
  onPersonRemoved: () => void;
}) {
  const [isAssignmentConfirmationOpen, setIsAssignmentConfirmationOpen] = useState(false);
  const [dialog, setDialog] = useState<UserDetailDialog>(null);
  const createManagerInvitation = useMutation(api.organizationInvitation.mutations.createForPerson);
  const removeManagerRole = useMutation(api.organization.mutations.removeManagerRole);
  const removePerson = useMutation(api.organization.mutations.removePersonFromOrganization);
  const operationShopId =
    data.shops.find((shop) => shop.shopId === selectedShopId)?.shopId ??
    data.shops.find((shop) => shop.shopStatus === "active")?.shopId ??
    data.shops[0]?.shopId ??
    null;
  const canAssignManager =
    data.canWrite &&
    selectedShopId !== null &&
    data.managerRole === "none" &&
    data.managerInvitationState.kind !== "unavailable" &&
    data.person.email.length > 0;
  const canAttemptManagerRoleRemoval = data.canWrite || data.canRemoveManagerRole;
  const canAttemptPersonRemoval = data.canWrite || data.canRemove;

  useEffect(() => {
    if (!canAssignManager) setIsAssignmentConfirmationOpen(false);
  }, [canAssignManager]);

  const { run: assignManager, isRunning: isAssigningManager } = useSingleFlight(async (): Promise<boolean> => {
    if (!canAssignManager || !selectedShopId) return false;

    try {
      await createManagerInvitation({
        shopId: selectedShopId as Id<"shops">,
        personId: data.person.id,
        requestId: crypto.randomUUID(),
      });
      setIsAssignmentConfirmationOpen(false);
      showSuccessToast({
        title: "ログイン案内を送りました",
        description: "本人のアカウントとユーザー情報の連携後に管理者になります。",
      });
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    }
  });

  const { run: confirmRemoval, isRunning: isRemoving } = useSingleFlight(async () => {
    if (!operationShopId || !dialog || dialog.kind === "removeMembership") return;
    const requestId = crypto.randomUUID();
    const shopId = operationShopId as Id<"shops">;

    try {
      if (dialog.kind === "removeManagerRole") {
        await removeManagerRole({ shopId, personId: data.person.id, requestId });
        showSuccessToast({
          title: "管理者権限を外しました",
          description:
            data.memberships.length > 0
              ? "スタッフとしての店舗所属は維持しています。"
              : "店舗所属がないため、このグループへのアクセスも終了しました。",
        });
        setDialog(null);
        if (data.isSelf || data.memberships.length === 0) onPersonRemoved();
        return;
      }

      await removePerson({ shopId, personId: data.person.id, requestId });
      setDialog(null);
      showSuccessToast({
        title: "ユーザーをグループから削除しました",
        description: "過去のシフト履歴は保持されます。",
      });
      onPersonRemoved();
    } catch (error) {
      showErrorToast(error);
    }
  });

  return {
    dialog,
    isAssignmentConfirmationOpen,
    isAssigningManager,
    isRemoving,
    onRequestManagerAssignment: () => {
      if (canAssignManager) setIsAssignmentConfirmationOpen(true);
    },
    onCancelManagerAssignment: () => setIsAssignmentConfirmationOpen(false),
    onAssignManager: assignManager,
    onRequestRemoveManagerRole: () => {
      if (operationShopId && canAttemptManagerRoleRemoval) setDialog({ kind: "removeManagerRole" });
    },
    onRequestRemovePerson: () => {
      if (operationShopId && canAttemptPersonRemoval) setDialog({ kind: "removePerson" });
    },
    onConfirmRemoval: confirmRemoval,
    onCloseDialog: () => setDialog(null),
  };
}
