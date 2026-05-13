import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { LuSparkles } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { LineInviteConfirmContent } from "@/src/components/features/Line/LineInviteConfirmContent";
import { LineLinkQrDialog } from "@/src/components/features/Line/LineLinkQrDialog";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { formatDateShort } from "@/src/domains/shift/date";
import { AddStaffForm } from "../AddStaffForm/index.tsx";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm/index.tsx";
import type { EditShopFormData } from "../EditShopForm/index";
import { EditShopForm } from "../EditShopForm/index.tsx";
import type { EditStaffFormData } from "../EditStaffForm/index";
import { EditStaffForm } from "../EditStaffForm/index.tsx";
import { HeroSummary, WelcomeHero } from "../HeroSummary";
import { LegalReconsentBanner } from "../LegalReconsentBanner";
import { RecruitmentBoard } from "../RecruitmentBoard";
import type { SetupData } from "../SetupModal";
import { SetupModal } from "../SetupModal";
import { StaffRoster } from "../StaffRoster";
import type { PaginationStatus, Recruitment, Staff } from "../types";
import { OnboardingCallout } from "./OnboardingCallout";
import {
  type DashboardOnboardingStage,
  deriveDashboardOnboardingState,
} from "./OnboardingCallout/deriveDashboardOnboardingState";

const REVIEWED_RECRUITMENT_STORAGE_KEY = "dashboardOnboardingReviewedRecruitments";

type Props = {
  shop: { name: string; shiftStartTime: string; shiftEndTime: string } | null;
  ownerProfileDefaults?: {
    name: string;
    email: string;
  };
  managerLegalConsentStatus?: {
    required: boolean;
    documents: {
      terms: { title: string; path: string };
      privacy: { title: string; path: string };
    };
  };
  recruitments: Recruitment[];
  recruitmentStatus: PaginationStatus;
  canLoadMoreRecruitments: boolean;
  loadMoreRecruitments: () => void;
  staffs: Staff[];
  staffStatus: PaginationStatus;
  canLoadMoreStaffs: boolean;
  loadMoreStaffs: () => void;
};

export const DashboardContent = ({
  shop,
  ownerProfileDefaults,
  managerLegalConsentStatus,
  recruitments,
  recruitmentStatus,
  canLoadMoreRecruitments,
  loadMoreRecruitments,
  staffs,
  staffStatus,
  canLoadMoreStaffs,
  loadMoreStaffs,
}: Props) => {
  const navigate = useNavigate();
  const recruitmentModal = useDialog();
  const staffModal = useDialog();
  const editStaffModal = useDialog();
  const editShopModal = useDialog();
  const deleteRecruitmentDialog = useDialog();
  const deleteStaffDialog = useDialog();
  const lineQrDialog = useDialog();
  const lineInviteDialog = useDialog();
  const setupModal = useDialog();
  const isSetupRequired = shop === null;
  const [editTarget, setEditTarget] = useState<Staff | null>(null);
  const [deleteRecruitmentTarget, setDeleteRecruitmentTarget] = useState<Recruitment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
  const [lineQrTarget, setLineQrTarget] = useState<Staff | null>(null);
  const [lineQrAuthorizeUrl, setLineQrAuthorizeUrl] = useState<string | null>(null);
  const [lineQrLoading, setLineQrLoading] = useState(false);
  const [lineInviteTarget, setLineInviteTarget] = useState<Staff | null>(null);
  const [legalConsentSubmitting, setLegalConsentSubmitting] = useState(false);
  const [dismissedOnboardingStages, setDismissedOnboardingStages] = useState<DashboardOnboardingStage[]>([]);
  const [reviewedRecruitmentIds, setReviewedRecruitmentIds] = useState(readReviewedRecruitmentIds);
  const onboardingState = deriveDashboardOnboardingState({
    recruitments,
    staffs,
    dismissedStages: dismissedOnboardingStages,
    reviewedRecruitmentIds,
  });
  const visibleOnboardingState =
    shop !== null && managerLegalConsentStatus?.required === false && onboardingState.kind === "visible"
      ? onboardingState
      : null;
  const shouldHideNextActionSection = visibleOnboardingState !== null || (shop !== null && !managerLegalConsentStatus);
  const deleteRecruitmentTitle = deleteRecruitmentTarget
    ? `${formatDateShort(deleteRecruitmentTarget.periodStart)}〜${formatDateShort(
        deleteRecruitmentTarget.periodEnd,
      )}のシフト募集を削除`
    : "シフト募集を削除";

  const setupShopAndOwner = useMutation(api.setup.mutations.setupShopAndOwner);
  const acceptManagerLegalConsent = useMutation(api.legal.mutations.acceptManagerLegalConsent);
  const createRecruitment = useMutation(api.recruitment.mutations.createRecruitment);
  const deleteRecruitmentMut = useMutation(api.recruitment.mutations.deleteRecruitment);
  const addStaffs = useMutation(api.staff.mutations.addStaffs);
  const editStaffMut = useMutation(api.staff.mutations.editStaff);
  const deleteStaffMut = useMutation(api.staff.mutations.deleteStaff);
  const updateShopSettings = useMutation(api.shop.mutations.updateShopSettings);
  const generateLineLinkToken = useMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useMutation(api.line.mutations.sendInvite);

  const handleOpenShiftBoard = (recruitmentId: string) => {
    if (visibleOnboardingState?.stage === "review_submission" && recruitments[0]?._id === recruitmentId) {
      setReviewedRecruitmentIds((current) => {
        if (current.includes(recruitmentId)) return current;
        const next = [...current, recruitmentId];
        writeReviewedRecruitmentIds(next);
        return next;
      });
    }
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

  const handleDeleteRecruitmentClick = (recruitment: Recruitment) => {
    setDeleteRecruitmentTarget(recruitment);
    deleteRecruitmentDialog.open();
  };

  const handleDeleteRecruitment = async () => {
    if (!deleteRecruitmentTarget) return;
    try {
      await deleteRecruitmentMut({ recruitmentId: deleteRecruitmentTarget._id });
      deleteRecruitmentDialog.close();
      setDeleteRecruitmentTarget(null);
      toaster.create({ title: "シフト募集を削除しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  };

  const handleAcceptManagerLegalConsent = async () => {
    try {
      setLegalConsentSubmitting(true);
      await acceptManagerLegalConsent({ acceptedLegal: true });
      toaster.create({ title: "同意を記録しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setLegalConsentSubmitting(false);
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

  return (
    <>
      <ContentWrapper>
        {shop ? (
          <>
            {managerLegalConsentStatus?.required && (
              <LegalReconsentBanner
                documents={managerLegalConsentStatus.documents}
                isSubmitting={legalConsentSubmitting}
                onAccept={handleAcceptManagerLegalConsent}
              />
            )}
            <HeroSummary
              shop={shop}
              recruitments={recruitments}
              onEditClick={editShopModal.open}
              onOpenShiftBoard={handleOpenShiftBoard}
              onCreateRecruitment={recruitmentModal.open}
              hideActionSection={shouldHideNextActionSection}
            />
            {visibleOnboardingState && (
              <Stack as="section" aria-label="シフトリへようこそ！" gap={{ base: 3, lg: 4 }}>
                <HStack gap={2.5} align="center">
                  <Box fontSize={{ base: "xl", lg: "2xl" }} flexShrink={0} color="fg.muted">
                    <LuSparkles />
                  </Box>
                  <Heading as="h2" textStyle="sectionTitle" color="gray.900">
                    シフトリへようこそ！
                  </Heading>
                </HStack>
                <OnboardingCallout
                  state={visibleOnboardingState}
                  showLabel={false}
                  onDismiss={(stage) =>
                    setDismissedOnboardingStages((current) => (current.includes(stage) ? current : [...current, stage]))
                  }
                />
              </Stack>
            )}
            <RecruitmentBoard
              recruitments={recruitments}
              status={recruitmentStatus}
              canLoadMore={canLoadMoreRecruitments}
              tourRecruitmentId={recruitments[0]?._id}
              onCreateClick={recruitmentModal.open}
              onOpenShiftBoard={handleOpenShiftBoard}
              onDeleteRecruitment={handleDeleteRecruitmentClick}
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
        title={deleteRecruitmentTitle}
        isOpen={deleteRecruitmentDialog.isOpen}
        onOpenChange={deleteRecruitmentDialog.onOpenChange}
        onClose={deleteRecruitmentDialog.close}
        onSubmit={handleDeleteRecruitment}
        submitLabel="この募集を削除"
        role="alertdialog"
        submitColorPalette="red"
      >
        <Text>本当に削除してよろしいですか？</Text>
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

      {isSetupRequired && (
        <SetupModal
          isOpen={setupModal.isOpen}
          onOpenChange={setupModal.onOpenChange}
          onComplete={handleSetupComplete}
          ownerProfileDefaults={ownerProfileDefaults}
        />
      )}
    </>
  );
};

function readReviewedRecruitmentIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.sessionStorage.getItem(REVIEWED_RECRUITMENT_STORAGE_KEY);
    if (!rawValue) return [];
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];
    return parsedValue.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeReviewedRecruitmentIds(recruitmentIds: readonly string[]) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(REVIEWED_RECRUITMENT_STORAGE_KEY, JSON.stringify(recruitmentIds));
  } catch {
    // sessionStorage が使えない環境でも、現在の画面状態だけは進められるようにする。
  }
}
