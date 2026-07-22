import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { UserDetailData, UserDetailDialog } from "./types";

export function useUserManagerActions({
  data,
  selectedShopId,
  onPersonRemoved,
}: {
  data: UserDetailData;
  selectedShopId: string | null;
  onPersonRemoved: (personId: UserDetailData["person"]["id"]) => void;
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

  useEffect(() => {
    if (!canAssignManager) setIsAssignmentConfirmationOpen(false);
  }, [canAssignManager]);

  useEffect(() => {
    setDialog((current) => {
      if (!current || current.kind === "removeMembership") return current;
      if (current.personId !== data.person.id || !operationShopId || current.shopId !== operationShopId) return null;
      if (current.kind === "removeManagerRole") return data.canRemoveManagerRole ? current : null;
      return data.canRemove && hasSameRemovalPreview(current.removalPreview, data.removalPreview) ? current : null;
    });
  }, [data.canRemove, data.canRemoveManagerRole, data.person.id, data.removalPreview, operationShopId]);

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
    if (dialog.personId !== data.person.id || dialog.shopId !== operationShopId) return;
    const shopId = dialog.shopId as Id<"shops">;

    try {
      if (dialog.kind === "removeManagerRole") {
        if (!data.canRemoveManagerRole) return;
        await removeManagerRole({ shopId, personId: dialog.personId, requestId: dialog.requestId });
        showSuccessToast({
          title: "管理者権限を外しました",
          description:
            data.memberships.length > 0
              ? "スタッフとしての店舗所属は維持しています。"
              : "このグループへのアクセスを終了しました。ユーザー情報とシフト記録は残しています。",
        });
        setDialog(null);
        if (data.isSelf || data.memberships.length === 0) onPersonRemoved(dialog.personId);
        return;
      }

      if (!data.canRemove || dialog.removalPreview.kind !== "ready") return;
      await removePerson({
        shopId,
        personId: dialog.personId,
        requestId: dialog.requestId,
        removalPreview: {
          assignmentCount: dialog.removalPreview.assignmentCount,
          fingerprint: dialog.removalPreview.fingerprint,
        },
      });
      setDialog(null);
      showSuccessToast({
        title: "ユーザーをグループから削除しました",
        description: "過去のシフト履歴は保持されます。",
      });
      onPersonRemoved(dialog.personId);
    } catch (error) {
      if (getConvexErrorMessage(error)?.includes("今日以降のシフト割当が変更されました")) setDialog(null);
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
      if (operationShopId && data.canRemoveManagerRole) {
        setDialog({
          kind: "removeManagerRole",
          personId: data.person.id,
          shopId: operationShopId,
          requestId: crypto.randomUUID(),
        });
      }
    },
    onRequestRemovePerson: () => {
      if (operationShopId && data.canRemove) {
        setDialog({
          kind: "removePerson",
          personId: data.person.id,
          shopId: operationShopId,
          removalPreview: data.removalPreview,
          requestId: crypto.randomUUID(),
        });
      }
    },
    onConfirmRemoval: confirmRemoval,
    onCloseDialog: () => setDialog(null),
  };
}

function hasSameRemovalPreview(left: UserDetailData["removalPreview"], right: UserDetailData["removalPreview"]) {
  if (left.kind !== right.kind || left.asOfDate !== right.asOfDate) return false;
  if (left.kind === "ready" && right.kind === "ready") {
    return left.assignmentCount === right.assignmentCount && left.fingerprint === right.fingerprint;
  }
  return (
    left.kind === "tooMany" &&
    right.kind === "tooMany" &&
    left.assignmentCountAtLeast === right.assignmentCountAtLeast &&
    left.limit === right.limit
  );
}
