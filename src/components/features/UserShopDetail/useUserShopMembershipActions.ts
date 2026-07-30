import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { UserShopDetailDialog, UserShopDetailMembership } from "./types";

export function useUserShopMembershipActions({
  targetShopId,
  membership,
  isReadOnly,
  canRemoveMembership,
}: {
  targetShopId: Id<"shops">;
  membership: UserShopDetailMembership;
  isReadOnly: boolean;
  canRemoveMembership: boolean;
}) {
  const [dialog, setDialog] = useState<UserShopDetailDialog>(null);
  const currentTargetRef = useRef({ targetShopId, staffId: membership.staffId, isReadOnly, canRemoveMembership });
  currentTargetRef.current = { targetShopId, staffId: membership.staffId, isReadOnly, canRemoveMembership };
  const setShiftExclusion = useMutation(api.staff.mutations.setShiftExclusion);
  const removePersonFromShop = useMutation(api.organization.mutations.removePersonFromShop);

  useEffect(() => {
    if (
      dialog?.kind === "removeMembership" &&
      (isReadOnly ||
        !canRemoveMembership ||
        !membership.canRemove ||
        dialog.membership.shopId !== targetShopId ||
        dialog.membership.staffId !== membership.staffId ||
        !hasSameRemovalPreview(dialog.membership.removalPreview, membership.removalPreview))
    ) {
      setDialog(null);
    }
  }, [canRemoveMembership, dialog, isReadOnly, membership, targetShopId]);

  const { run: changeShiftTarget, isRunning: isChangingShiftTarget } = useSingleFlight(
    async (isShiftTarget: boolean) => {
      const target = currentTargetRef.current;
      if (target.isReadOnly || membership.shopId !== target.targetShopId || membership.staffId !== target.staffId)
        return;
      const excluded = !isShiftTarget;
      try {
        await setShiftExclusion({ shopId: target.targetShopId, staffId: target.staffId, excluded });
        const current = currentTargetRef.current;
        if (current.targetShopId === target.targetShopId && current.staffId === target.staffId) {
          showSuccessToast({ title: excluded ? "シフト対象外にしました" : "シフト対象に戻しました" });
        }
      } catch (error) {
        const current = currentTargetRef.current;
        if (current.targetShopId === target.targetShopId && current.staffId === target.staffId) showErrorToast(error);
      }
    },
  );

  const { run: removeMembership, isRunning: isRemovingMembership } = useSingleFlight(async (): Promise<boolean> => {
    const target = currentTargetRef.current;
    if (
      target.isReadOnly ||
      !target.canRemoveMembership ||
      membership.shopId !== target.targetShopId ||
      membership.staffId !== target.staffId ||
      !membership.canRemove ||
      dialog?.kind !== "removeMembership" ||
      dialog.membership.shopId !== target.targetShopId ||
      dialog.membership.staffId !== target.staffId ||
      dialog.membership.removalPreview.kind !== "ready"
    ) {
      return false;
    }

    try {
      await removePersonFromShop({
        shopId: target.targetShopId,
        staffId: target.staffId,
        requestId: dialog.requestId,
        removalPreview: {
          assignmentCount: dialog.membership.removalPreview.assignmentCount,
          fingerprint: dialog.membership.removalPreview.fingerprint,
        },
      });
      setDialog(null);
      const current = currentTargetRef.current;
      if (current.targetShopId === target.targetShopId && current.staffId === target.staffId) {
        showSuccessToast({
          title: "この店舗のスタッフ所属を削除しました",
          description: "グループのユーザー情報、ほかの店舗所属、管理者権限は変更していません。",
        });
        return true;
      }
      return false;
    } catch (error) {
      if (getConvexErrorMessage(error)?.includes("今日以降のシフト割当が変更されました")) setDialog(null);
      const current = currentTargetRef.current;
      if (current.targetShopId === target.targetShopId && current.staffId === target.staffId) showErrorToast(error);
      return false;
    }
  });

  return {
    dialog,
    isChangingShiftTarget,
    isRemovingMembership,
    onChangeShiftTarget: changeShiftTarget,
    onRequestRemoveMembership: () => {
      const target = currentTargetRef.current;
      if (
        !target.isReadOnly &&
        target.canRemoveMembership &&
        membership.canRemove &&
        membership.shopId === target.targetShopId &&
        membership.staffId === target.staffId
      ) {
        setDialog({ kind: "removeMembership", membership, requestId: crypto.randomUUID() });
      }
    },
    onConfirmRemoveMembership: removeMembership,
    onCloseDialog: () => setDialog(null),
  };
}

function hasSameRemovalPreview(
  left: UserShopDetailMembership["removalPreview"],
  right: UserShopDetailMembership["removalPreview"],
) {
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
