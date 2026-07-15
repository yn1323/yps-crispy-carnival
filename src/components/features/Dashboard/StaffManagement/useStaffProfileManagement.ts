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
};

export function useStaffProfileManagement(staffs: Staff[], { onResetDetail }: Options) {
  const dialog = useDialog();
  const [staffId, setStaffId] = useState<Staff["_id"] | null>(null);
  const staff = staffId ? (staffs.find((candidate) => candidate._id === staffId) ?? null) : null;
  const editStaff = useShopMutation(api.staff.mutations.editStaff);
  const deleteStaff = useShopMutation(api.staff.mutations.deleteStaff);
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
    if (!staff) return;
    try {
      await editStaff({ staffId: staff._id, name: data.name, email: data.email });
      showSuccessToast({ title: "スタッフ情報を更新しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleDelete, isRunning: isDeleting } = useSingleFlight(async (target: Staff) => {
    try {
      await deleteStaff({ staffId: target._id });
      handleClose();
      showSuccessToast({ title: "スタッフを削除しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleChangeShiftTarget, isRunning: isChangingShiftTarget } = useSingleFlight(
    async (target: Staff, isShiftTarget: boolean) => {
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
