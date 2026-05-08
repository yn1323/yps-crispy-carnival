import { Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { LineBulkInviteContent } from "@/src/components/features/Line/LineBulkInviteContent";
import { LineInviteConfirmContent } from "@/src/components/features/Line/LineInviteConfirmContent";
import { LineLinkQrDialog } from "@/src/components/features/Line/LineLinkQrDialog";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { AddStaffForm } from "../AddStaffForm/index.tsx";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm/index.tsx";
import type { EditShopFormData } from "../EditShopForm/index";
import { EditShopForm } from "../EditShopForm/index.tsx";
import type { EditStaffFormData } from "../EditStaffForm/index";
import { EditStaffForm } from "../EditStaffForm/index.tsx";
import { HeroSummary, WelcomeHero } from "../HeroSummary";
import { RecruitmentBoard } from "../RecruitmentBoard";
import type { SetupData } from "../SetupModal";
import { SetupModal } from "../SetupModal";
import { StaffRoster } from "../StaffRoster";
import type { PaginationStatus, Recruitment, Staff } from "../types";

type Props = {
  shop: { name: string; shiftStartTime: string; shiftEndTime: string } | null;
  recruitments: Recruitment[];
  recruitmentStatus: PaginationStatus;
  canLoadMoreRecruitments: boolean;
  loadMoreRecruitments: () => void;
  staffs: Staff[];
  staffStatus: PaginationStatus;
  canLoadMoreStaffs: boolean;
  loadMoreStaffs: () => void;
  lineBulkInviteTargetCount?: number;
};

export const DashboardContent = ({
  shop,
  recruitments,
  recruitmentStatus,
  canLoadMoreRecruitments,
  loadMoreRecruitments,
  staffs,
  staffStatus,
  canLoadMoreStaffs,
  loadMoreStaffs,
  lineBulkInviteTargetCount,
}: Props) => {
  const navigate = useNavigate();
  const recruitmentModal = useDialog();
  const staffModal = useDialog();
  const editStaffModal = useDialog();
  const editShopModal = useDialog();
  const deleteStaffDialog = useDialog();
  const lineQrDialog = useDialog();
  const lineInviteDialog = useDialog();
  const lineBulkInviteDialog = useDialog();
  const setupModal = useDialog();
  const isSetupRequired = shop === null;
  const [editTarget, setEditTarget] = useState<Staff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
  const [lineQrTarget, setLineQrTarget] = useState<Staff | null>(null);
  const [lineQrAuthorizeUrl, setLineQrAuthorizeUrl] = useState<string | null>(null);
  const [lineQrLoading, setLineQrLoading] = useState(false);
  const [lineInviteTarget, setLineInviteTarget] = useState<Staff | null>(null);

  const setupShopAndOwner = useMutation(api.setup.mutations.setupShopAndOwner);
  const createRecruitment = useMutation(api.recruitment.mutations.createRecruitment);
  const addStaffs = useMutation(api.staff.mutations.addStaffs);
  const editStaffMut = useMutation(api.staff.mutations.editStaff);
  const deleteStaffMut = useMutation(api.staff.mutations.deleteStaff);
  const updateShopSettings = useMutation(api.shop.mutations.updateShopSettings);
  const generateLineLinkToken = useMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useMutation(api.line.mutations.sendInvite);
  const sendLineInviteBulk = useMutation(api.line.mutations.sendInviteBulk);

  const handleOpenShiftBoard = (recruitmentId: string) => {
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  const handleSetupComplete = async (data: SetupData) => {
    try {
      await setupShopAndOwner({
        shopName: data.shopName,
        shiftStartTime: data.shiftStartTime,
        shiftEndTime: data.shiftEndTime,
        ownerName: data.name,
        ownerEmail: data.email,
        acceptedLegal: data.acceptedLegal as true,
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
      toaster.create({ title: "募集をつくりました", type: "success" });
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

  const handleShowLineQr = async (staff: Staff) => {
    setLineQrTarget(staff);
    setLineQrAuthorizeUrl(null);
    setLineQrLoading(true);
    lineQrDialog.open();
    try {
      const r = await generateLineLinkToken({ staffId: staff._id });
      setLineQrAuthorizeUrl(r.authorizeUrl);
    } catch (error) {
      showErrorToast(error);
      lineQrDialog.close();
    } finally {
      setLineQrLoading(false);
    }
  };

  const handleSendLineInviteClick = (staff: Staff) => {
    setLineInviteTarget(staff);
    lineInviteDialog.open();
  };

  const handleSendLineInviteConfirm = async () => {
    if (!lineInviteTarget) return;
    try {
      await sendLineInvite({ staffId: lineInviteTarget._id });
      lineInviteDialog.close();
      toaster.create({ title: "LINE連携リンクをメールで送信しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleSendLineInviteBulkClick = () => {
    lineBulkInviteDialog.open();
  };

  const handleSendLineInviteBulkConfirm = async () => {
    try {
      const r = await sendLineInviteBulk({});
      lineBulkInviteDialog.close();
      toaster.create({
        title:
          r.sentCount > 0 ? `${r.sentCount}名にLINE連携リンクをメールで送信しました` : "送信対象のスタッフがいません",
        type: "success",
      });
    } catch (error) {
      showErrorToast(error);
    }
  };

  return (
    <>
      <ContentWrapper>
        {shop ? (
          <>
            <HeroSummary
              shop={shop}
              recruitments={recruitments}
              onEditClick={editShopModal.open}
              onOpenShiftBoard={handleOpenShiftBoard}
              onCreateRecruitment={recruitmentModal.open}
            />
            <RecruitmentBoard
              recruitments={recruitments}
              status={recruitmentStatus}
              canLoadMore={canLoadMoreRecruitments}
              onCreateClick={recruitmentModal.open}
              onOpenShiftBoard={handleOpenShiftBoard}
              onLoadMore={loadMoreRecruitments}
            />
            <StaffRoster
              staffs={staffs}
              status={staffStatus}
              canLoadMore={canLoadMoreStaffs}
              onAddClick={staffModal.open}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
              onShowLineQr={handleShowLineQr}
              onSendLineInvite={handleSendLineInviteClick}
              onSendLineInviteBulk={handleSendLineInviteBulkClick}
              lineBulkInviteTargetCount={lineBulkInviteTargetCount}
              onLoadMore={loadMoreStaffs}
            />
          </>
        ) : (
          <WelcomeHero onSetupClick={setupModal.open} />
        )}
      </ContentWrapper>

      <Dialog
        title="新しい募集をつくる"
        isOpen={recruitmentModal.isOpen}
        onOpenChange={recruitmentModal.onOpenChange}
        formId="create-recruitment-form"
        submitLabel="募集をつくる"
        onClose={recruitmentModal.close}
      >
        <CreateRecruitmentForm onSubmit={handleCreateRecruitment} />
      </Dialog>

      <Dialog
        title="スタッフを追加"
        isOpen={staffModal.isOpen}
        onOpenChange={staffModal.onOpenChange}
        formId="add-staff-form"
        submitLabel="スタッフを追加する"
        onClose={staffModal.close}
        maxW="640px"
        maxH="85dvh"
      >
        <AddStaffForm onSubmit={handleAddStaffs} />
      </Dialog>

      <Dialog
        title="スタッフを編集"
        isOpen={editStaffModal.isOpen}
        onOpenChange={editStaffModal.onOpenChange}
        formId="edit-staff-form"
        submitLabel="変更を保存"
        onClose={editStaffModal.close}
      >
        {editTarget && <EditStaffForm staff={editTarget} onSubmit={handleEditStaff} />}
      </Dialog>

      <Dialog
        title="店舗設定"
        isOpen={editShopModal.isOpen}
        onOpenChange={editShopModal.onOpenChange}
        formId="edit-shop-form"
        submitLabel="変更を保存"
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
      </Dialog>

      <Dialog
        title="スタッフを削除"
        isOpen={deleteStaffDialog.isOpen}
        onOpenChange={deleteStaffDialog.onOpenChange}
        onClose={deleteStaffDialog.close}
        onSubmit={handleDeleteStaff}
        submitLabel="このスタッフを削除"
        role="alertdialog"
        submitColorPalette="red"
      >
        <Text>「{deleteTarget?.name}」を削除しますか？</Text>
        <Text fontSize="sm" color="gray.600">
          削除すると元に戻せません。
        </Text>
      </Dialog>

      <Dialog
        title="LINE連携リンク"
        isOpen={lineQrDialog.isOpen}
        onOpenChange={lineQrDialog.onOpenChange}
        onClose={lineQrDialog.close}
        hideFooter
      >
        <LineLinkQrDialog
          authorizeUrl={lineQrAuthorizeUrl}
          isLoading={lineQrLoading}
          staffName={lineQrTarget?.name ?? ""}
        />
      </Dialog>

      <Dialog
        title="LINE連携リンクをメールで送る"
        isOpen={lineInviteDialog.isOpen}
        onOpenChange={lineInviteDialog.onOpenChange}
        onClose={lineInviteDialog.close}
        onSubmit={handleSendLineInviteConfirm}
        submitLabel="送信"
      >
        {lineInviteTarget && (
          <LineInviteConfirmContent staffName={lineInviteTarget.name} staffEmail={lineInviteTarget.email} />
        )}
      </Dialog>

      <Dialog
        title="未連携のスタッフにまとめて送る"
        isOpen={lineBulkInviteDialog.isOpen}
        onOpenChange={lineBulkInviteDialog.onOpenChange}
        onClose={lineBulkInviteDialog.close}
        onSubmit={handleSendLineInviteBulkConfirm}
        submitLabel="送信"
      >
        <LineBulkInviteContent unlinkedCount={lineBulkInviteTargetCount ?? 0} />
      </Dialog>

      {isSetupRequired && (
        <SetupModal
          isOpen={setupModal.isOpen}
          onOpenChange={setupModal.onOpenChange}
          onComplete={handleSetupComplete}
        />
      )}
    </>
  );
};
