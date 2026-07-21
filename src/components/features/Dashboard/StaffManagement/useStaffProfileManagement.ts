import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { EditStaffFormData } from "../EditStaffForm";
import type { Staff } from "../types";

type Options = {
  onResetDetail: () => void;
  isReadOnly?: boolean;
};

export function useStaffProfileManagement(staffs: Staff[], { onResetDetail, isReadOnly = false }: Options) {
  const dialog = useDialog();
  const [staffId, setStaffId] = useState<Staff["_id"] | null>(null);
  const staff = staffId ? (staffs.find((candidate) => candidate._id === staffId) ?? null) : null;
  const editStaff = useShopMutation(api.staff.mutations.editStaff);
  const deleteStaff = useShopMutation(api.staff.mutations.deleteStaff);
  const removePersonFromShop = useShopMutation(api.organization.mutations.removePersonFromShop);
  const setShiftExclusion = useShopMutation(api.staff.mutations.setShiftExclusion);

  const resetDetail = useCallback(() => {
    setStaffId(null);
    onResetDetail();
  }, [onResetDetail]);

  const handleOpen = (target: Staff) => {
    setStaffId(target._id);
    onResetDetail();
    dialog.open();
  };

  const handleOpenChange = (details: { open: boolean }) => {
    dialog.onOpenChange(details);
    if (!details.open) resetDetail();
  };

  const handleClose = () => {
    dialog.close();
    resetDetail();
  };

  const { run: handleEdit, isRunning: isEditing } = useSingleFlight(async (data: EditStaffFormData) => {
    if (isReadOnly || !staff) return;
    try {
      await editStaff({ staffId: staff._id, name: data.name, email: data.email });
      showSuccessToast({ title: "スタッフ情報を更新しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleDelete, isRunning: isDeleting } = useSingleFlight(async (target: Staff) => {
    if (isReadOnly) return;
    try {
      if (target.isOrganizationLinked) {
        await removePersonFromShop({ staffId: target._id, requestId: crypto.randomUUID() });
      } else {
        // TODO[narrow]: develop/prodでm011_staffs_to_organization_peopleが完走したことを
        // `pnpm convex:migrate:status`で確認し、移行済みフロント配布後にこの分岐とdeleteStaff hookを削除する。
        await deleteStaff({ staffId: target._id });
      }
      handleClose();
      showSuccessToast({
        title: target.isOrganizationLinked ? "この店舗のスタッフ所属を削除しました" : "スタッフを削除しました",
        ...(target.isOrganizationLinked
          ? { description: "グループのユーザー情報、ほかの店舗所属、管理者権限は変更していません。" }
          : {}),
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleChangeShiftTarget, isRunning: isChangingShiftTarget } = useSingleFlight(
    async (target: Staff, isShiftTarget: boolean) => {
      if (isReadOnly) return;
      const nextExcluded = !isShiftTarget;
      try {
        await setShiftExclusion({ staffId: target._id, excluded: nextExcluded });
        toaster.create({
          title: nextExcluded ? "シフト対象外にしました" : "シフト対象に戻しました",
          type: "success",
        });
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

  return {
    staff,
    dialog,
    onOpen: handleOpen,
    onOpenChange: handleOpenChange,
    onClose: handleClose,
    onEdit: handleEdit,
    isEditing,
    onDelete: handleDelete,
    isDeleting,
    onChangeShiftTarget: handleChangeShiftTarget,
    isChangingShiftTarget,
  };
}
