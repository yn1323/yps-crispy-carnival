import { Stack, Text, useBreakpointValue } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { AddStaffForm } from "../AddStaffForm/index.tsx";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm/index.tsx";
import type { EditShopFormData } from "../EditShopForm/index";
import { EditShopForm } from "../EditShopForm/index.tsx";
import type { EditStaffFormData } from "../EditStaffForm/index";
import { EditStaffForm } from "../EditStaffForm/index.tsx";
import { RecruitmentSection } from "../RecruitmentSection";
import type { SetupData } from "../SetupModal";
import { SetupModal } from "../SetupModal";
import { ShopInfoBar } from "../ShopInfoBar";
import { StaffSection } from "../StaffSection";
import { getDisplayStatus, type Recruitment, type Staff } from "../types";

type Props = {
  shop: { name: string; shiftStartTime: string; shiftEndTime: string } | null;
  recruitments: Recruitment[];
  staffs: Staff[];
};

export const DashboardContent = ({ shop, recruitments, staffs }: Props) => {
  const navigate = useNavigate();
  const recruitmentModal = useDialog();
  const staffModal = useDialog();
  const editStaffModal = useDialog();
  const editShopModal = useDialog();
  const deleteStaffDialog = useDialog();
  const shiftBoardWarning = useDialog();
  const isMobile = useBreakpointValue({ base: true, lg: false });
  const isSetupRequired = shop === null;
  const [editTarget, setEditTarget] = useState<Staff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
  const [pendingRecruitmentId, setPendingRecruitmentId] = useState<string | null>(null);

  const setupShopAndOwner = useMutation(api.setup.mutations.setupShopAndOwner);
  const createRecruitment = useMutation(api.recruitment.mutations.createRecruitment);
  const addStaffs = useMutation(api.staff.mutations.addStaffs);
  const editStaffMut = useMutation(api.staff.mutations.editStaff);
  const deleteStaffMut = useMutation(api.staff.mutations.deleteStaff);
  const updateShopSettings = useMutation(api.shop.mutations.updateShopSettings);

  const Modal = isMobile ? BottomSheet : Dialog;

  const navigateToShiftBoard = (recruitmentId: string) => {
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  const handleOpenShiftBoard = (recruitmentId: string) => {
    const recruitment = recruitments.find((r) => r._id === recruitmentId);
    if (recruitment && getDisplayStatus(recruitment) === "collecting") {
      setPendingRecruitmentId(recruitmentId);
      shiftBoardWarning.open();
      return;
    }
    navigateToShiftBoard(recruitmentId);
  };

  const handleConfirmNavigation = () => {
    if (pendingRecruitmentId) {
      navigateToShiftBoard(pendingRecruitmentId);
    }
    shiftBoardWarning.close();
  };

  const handleSetupComplete = async (data: SetupData) => {
    try {
      await setupShopAndOwner({
        shopName: data.shopName,
        shiftStartTime: data.shiftStartTime,
        shiftEndTime: data.shiftEndTime,
        ownerName: data.name,
        ownerEmail: data.email,
      });
      toaster.create({ title: "セットアップが完了しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleCreateRecruitment = async (data: { periodStart: string; periodEnd: string; deadline: string }) => {
    try {
      await createRecruitment(data);
      recruitmentModal.close();
      toaster.create({ title: "シフトを作成しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleAddStaffs = async (data: { entries: Array<{ name: string; email: string }> }) => {
    try {
      await addStaffs({ entries: data.entries });
      staffModal.close();
      toaster.create({ title: "スタッフを追加しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleEditClick = (staff: Staff) => {
    setEditTarget(staff);
    editStaffModal.open();
  };

  const handleDeleteClick = (staff: Staff) => {
    setDeleteTarget(staff);
    deleteStaffDialog.open();
  };

  const handleEditStaff = async (data: EditStaffFormData) => {
    if (!editTarget) return;
    try {
      await editStaffMut({ staffId: editTarget._id, name: data.name, email: data.email });
      editStaffModal.close();
      toaster.create({ title: "スタッフ情報を更新しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleUpdateShop = async (data: EditShopFormData) => {
    try {
      await updateShopSettings(data);
      editShopModal.close();
      toaster.create({ title: "店舗設定を更新しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleDeleteStaff = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStaffMut({ staffId: deleteTarget._id });
      deleteStaffDialog.close();
      toaster.create({ title: "スタッフを削除しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  return (
    <>
      <ContentWrapper>
        {shop && (
          <ShopInfoBar
            name={shop.name}
            shiftStartTime={shop.shiftStartTime}
            shiftEndTime={shop.shiftEndTime}
            onEditClick={editShopModal.open}
          />
        )}
        <RecruitmentSection
          recruitments={recruitments}
          onCreateClick={recruitmentModal.open}
          onOpenShiftBoard={handleOpenShiftBoard}
        />
        <StaffSection
          staffs={staffs}
          onAddClick={staffModal.open}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />
      </ContentWrapper>

      <Modal
        title="シフト希望を集める"
        isOpen={recruitmentModal.isOpen}
        onOpenChange={recruitmentModal.onOpenChange}
        formId="create-recruitment-form"
        submitLabel="作成する"
        onClose={recruitmentModal.close}
      >
        <CreateRecruitmentForm onSubmit={handleCreateRecruitment} />
      </Modal>

      <Modal
        title="スタッフを追加"
        isOpen={staffModal.isOpen}
        onOpenChange={staffModal.onOpenChange}
        formId="add-staff-form"
        submitLabel="登録する"
        onClose={staffModal.close}
        maxW="640px"
        maxH="85dvh"
      >
        <AddStaffForm onSubmit={handleAddStaffs} />
      </Modal>

      <Modal
        title="スタッフを編集"
        isOpen={editStaffModal.isOpen}
        onOpenChange={editStaffModal.onOpenChange}
        formId="edit-staff-form"
        submitLabel="更新する"
        onClose={editStaffModal.close}
      >
        {editTarget && <EditStaffForm staff={editTarget} onSubmit={handleEditStaff} />}
      </Modal>

      <Modal
        title="店舗設定"
        isOpen={editShopModal.isOpen}
        onOpenChange={editShopModal.onOpenChange}
        formId="edit-shop-form"
        submitLabel="保存する"
        onClose={editShopModal.close}
      >
        {shop && (
          <EditShopForm
            defaultValues={{
              shopName: shop.name,
              shiftStartTime: shop.shiftStartTime,
              shiftEndTime: shop.shiftEndTime,
            }}
            onSubmit={handleUpdateShop}
          />
        )}
      </Modal>

      <Dialog
        title="スタッフを削除"
        isOpen={deleteStaffDialog.isOpen}
        onOpenChange={deleteStaffDialog.onOpenChange}
        onClose={deleteStaffDialog.close}
        onSubmit={handleDeleteStaff}
        submitLabel="削除する"
        role="alertdialog"
        submitColorPalette="red"
      >
        <Text>「{deleteTarget?.name}」を削除しますか？</Text>
        <Text fontSize="sm" color="gray.600">
          この操作は取り消せません。
        </Text>
      </Dialog>

      <Dialog
        title="シフト希望がまだ変わるかも"
        isOpen={shiftBoardWarning.isOpen}
        onOpenChange={shiftBoardWarning.onOpenChange}
        onClose={shiftBoardWarning.close}
        onSubmit={handleConfirmNavigation}
        submitLabel="編集画面へ進む"
        role="alertdialog"
      >
        <Stack gap={1}>
          <Text>全員分の希望がそろっていません</Text>
          <Text>編集中にも変更される場合があります</Text>
        </Stack>
      </Dialog>

      {isSetupRequired && <SetupModal isOpen={true} onOpenChange={() => {}} onComplete={handleSetupComplete} />}
    </>
  );
};
