import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserDetailDialog, UserDetailMembership } from "./types";

export function useUserMembershipActions({
  membership,
  selectedShopId,
  isReadOnly,
}: {
  membership: UserDetailMembership | null;
  selectedShopId: string | null;
  isReadOnly: boolean;
}) {
  const [dialog, setDialog] = useState<UserDetailDialog>(null);
  const setShiftExclusion = useShopMutation(api.staff.mutations.setShiftExclusion);
  const removePersonFromShop = useMutation(api.organization.mutations.removePersonFromShop);

  useEffect(() => {
    if (
      dialog?.kind === "removeMembership" &&
      (isReadOnly || !membership?.canRemove || dialog.membership.staffId !== membership.staffId)
    ) {
      setDialog(null);
    }
  }, [dialog, isReadOnly, membership?.canRemove, membership?.staffId]);

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

  const { run: removeMembership, isRunning: isRemovingMembership } = useSingleFlight(async () => {
    if (
      isReadOnly ||
      !selectedShopId ||
      !membership?.canRemove ||
      dialog?.kind !== "removeMembership" ||
      dialog.membership.shopId !== selectedShopId ||
      dialog.membership.staffId !== membership.staffId
    ) {
      return;
    }

    try {
      await removePersonFromShop({
        shopId: selectedShopId as Id<"shops">,
        staffId: dialog.membership.staffId,
        requestId: crypto.randomUUID(),
      });
      setDialog(null);
      showSuccessToast({
        title: "この店舗のスタッフ所属を削除しました",
        description: "グループのユーザー情報、ほかの店舗所属、管理者権限は変更していません。",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return {
    dialog,
    isChangingShiftTarget,
    isRemovingMembership,
    onChangeShiftTarget: changeShiftTarget,
    onRequestRemoveMembership: () => {
      if (!isReadOnly && membership?.canRemove) setDialog({ kind: "removeMembership", membership });
    },
    onConfirmRemoveMembership: removeMembership,
    onCloseDialog: () => setDialog(null),
  };
}
