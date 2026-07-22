import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { UserDetailDialog, UserDetailMembership } from "./types";

export function useUserMembershipActions({
  membership,
  selectedShopId,
  isReadOnly,
  canAddMembership,
}: {
  membership: UserDetailMembership | null;
  selectedShopId: string | null;
  isReadOnly: boolean;
  canAddMembership: boolean;
}) {
  const [dialog, setDialog] = useState<UserDetailDialog>(null);
  const [addingShopId, setAddingShopId] = useState<Id<"shops"> | null>(null);
  const setShiftExclusion = useShopMutation(api.staff.mutations.setShiftExclusion);
  const addOrganizationPersonToShop = useMutation(api.staff.mutations.addOrganizationPersonToShop);
  const removePersonFromShop = useMutation(api.organization.mutations.removePersonFromShop);

  useEffect(() => {
    if (
      dialog?.kind === "removeMembership" &&
      (isReadOnly ||
        !membership?.canRemove ||
        dialog.membership.shopId !== selectedShopId ||
        dialog.membership.staffId !== membership.staffId ||
        !hasSameRemovalPreview(dialog.membership.removalPreview, membership.removalPreview))
    ) {
      setDialog(null);
    }
  }, [dialog, isReadOnly, membership, selectedShopId]);

  const { run: changeShiftTarget, isRunning: isChangingShiftTarget } = useSingleFlight(
    async (isShiftTarget: boolean) => {
      if (isReadOnly || !membership) return;
      const excluded = !isShiftTarget;
      try {
        await setShiftExclusion({ staffId: membership.staffId, excluded });
        showSuccessToast({ title: excluded ? "シフト対象外にしました" : "シフト対象に戻しました" });
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

  const { run: removeMembership, isRunning: isRemovingMembership } = useSingleFlight(async (): Promise<boolean> => {
    if (
      isReadOnly ||
      !selectedShopId ||
      !membership?.canRemove ||
      dialog?.kind !== "removeMembership" ||
      dialog.membership.shopId !== selectedShopId ||
      dialog.membership.staffId !== membership.staffId ||
      dialog.membership.removalPreview.kind !== "ready"
    ) {
      return false;
    }

    try {
      await removePersonFromShop({
        shopId: selectedShopId as Id<"shops">,
        staffId: dialog.membership.staffId,
        requestId: dialog.requestId,
        removalPreview: {
          assignmentCount: dialog.membership.removalPreview.assignmentCount,
          fingerprint: dialog.membership.removalPreview.fingerprint,
        },
      });
      setDialog(null);
      showSuccessToast({
        title: "この店舗のスタッフ所属を削除しました",
        description: "グループのユーザー情報、ほかの店舗所属、管理者権限は変更していません。",
      });
      return true;
    } catch (error) {
      if (getConvexErrorMessage(error)?.includes("今日以降のシフト割当が変更されました")) setDialog(null);
      showErrorToast(error);
      return false;
    }
  });

  const { run: addMembership, isRunning: isAddingMembership } = useSingleFlight(
    async (personId: Id<"organizationPeople">, shopId: Id<"shops">) => {
      if (!canAddMembership) return false;
      setAddingShopId(shopId);
      try {
        await addOrganizationPersonToShop({ shopId, personId, requestId: crypto.randomUUID() });
        showSuccessToast({ title: "店舗にユーザーを追加しました" });
        return true;
      } catch (error) {
        showErrorToast(error);
        return false;
      } finally {
        setAddingShopId(null);
      }
    },
  );

  return {
    dialog,
    isChangingShiftTarget,
    isRemovingMembership,
    isAddingMembership,
    addingShopId,
    onAddMembership: addMembership,
    onChangeShiftTarget: changeShiftTarget,
    onRequestRemoveMembership: () => {
      if (!isReadOnly && membership?.canRemove) {
        setDialog({ kind: "removeMembership", membership, requestId: crypto.randomUUID() });
      }
    },
    onConfirmRemoveMembership: removeMembership,
    onCloseDialog: () => setDialog(null),
  };
}

function hasSameRemovalPreview(
  left: UserDetailMembership["removalPreview"],
  right: UserDetailMembership["removalPreview"],
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
