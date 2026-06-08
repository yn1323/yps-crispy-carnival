import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { LuSparkles, LuUserPlus } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { LineInviteConfirmContent } from "@/src/components/features/Line/LineInviteConfirmContent";
import { LineLinkQrDialog } from "@/src/components/features/Line/LineLinkQrDialog";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { Button } from "@/src/components/ui/Button";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { formatDateShort } from "@/src/domains/shift/date";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { AddStaffForm } from "../AddStaffForm/index.tsx";
import type { CreateRecruitmentData } from "../CreateRecruitmentForm/index";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm/index.tsx";
import { getCreateRecruitmentErrorMessage } from "../createRecruitmentErrors";
import type { EditShopFormData } from "../EditShopForm/index";
import { EditShopForm } from "../EditShopForm/index.tsx";
import type { EditStaffFormData } from "../EditStaffForm/index";
import { EditStaffForm } from "../EditStaffForm/index.tsx";
import { HeroSummary, HeroSummarySkeleton, WelcomeHero } from "../HeroSummary";
import { LegalReconsentBanner } from "../LegalReconsentBanner";
import { RecruitmentBoard, RecruitmentBoardSkeleton } from "../RecruitmentBoard";
import type { SetupData } from "../SetupModal";
import { SetupModal } from "../SetupModal";
import { StaffRegistrationLinkPanel } from "../StaffRegistrationLinkPanel";
import { StaffRegistrationRequestBanner, StaffRegistrationRequestDialog } from "../StaffRegistrationRequests";
import { StaffRoster, StaffRosterSkeleton } from "../StaffRoster";
import type { PaginationStatus, Recruitment, Staff, StaffRegistrationRequest } from "../types";
import { OnboardingCallout } from "./OnboardingCallout";
import {
  type DashboardOnboardingStage,
  deriveDashboardOnboardingState,
} from "./OnboardingCallout/deriveDashboardOnboardingState";

const REVIEWED_RECRUITMENT_STORAGE_KEY = "dashboardOnboardingReviewedRecruitments";
const COMPLETED_ONBOARDING_STAGES: DashboardOnboardingStage[] = [
  "create_recruitment",
  "submit_self",
  "review_submission",
  "add_staff",
];

type Props = {
  shop: {
    name: string;
    regularClosedDays: EditShopFormData["regularClosedDays"];
    submissionPattern: EditShopFormData["submissionPattern"];
  } | null;
  managerProfileDefaults?: {
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
  pendingStaffRequests?: StaffRegistrationRequest[];
  isDashboardOnboardingDismissed?: boolean;
};

export const DashboardContent = ({
  shop,
  managerProfileDefaults,
  managerLegalConsentStatus,
  recruitments,
  recruitmentStatus,
  canLoadMoreRecruitments,
  loadMoreRecruitments,
  staffs,
  staffStatus,
  canLoadMoreStaffs,
  loadMoreStaffs,
  pendingStaffRequests = [],
  isDashboardOnboardingDismissed = false,
}: Props) => {
  const navigate = useNavigate();
  const recruitmentModal = useDialog();
  const staffModal = useDialog();
  const editStaffModal = useDialog();
  const editShopModal = useDialog();
  const deleteRecruitmentDialog = useDialog();
  const deleteStaffDialog = useDialog();
  const staffRegistrationDialog = useDialog();
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
  const [staffModalMode, setStaffModalMode] = useState<"qr" | "manual">("qr");
  const [registrationUrl, setRegistrationUrl] = useState<string | null>(null);
  const [registrationUrlLoading, setRegistrationUrlLoading] = useState(false);
  const [rejectRequestTarget, setRejectRequestTarget] = useState<StaffRegistrationRequest | null>(null);
  const [dismissedOnboardingStages, setDismissedOnboardingStages] = useState<DashboardOnboardingStage[]>([]);
  const [autoDismissedOnboarding, setAutoDismissedOnboarding] = useState(false);
  const [reviewedRecruitmentIds, setReviewedRecruitmentIds] = useState(readReviewedRecruitmentIds);
  const shouldTreatOnboardingDismissed =
    isDashboardOnboardingDismissed || autoDismissedOnboarding || pendingStaffRequests.length > 0;
  const onboardingState = deriveDashboardOnboardingState({
    recruitments,
    staffs,
    dismissedStages: shouldTreatOnboardingDismissed ? COMPLETED_ONBOARDING_STAGES : dismissedOnboardingStages,
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

  const setupShopAndManager = useMutation(api.setup.mutations.setupShopAndManager);
  const acceptManagerLegalConsent = useMutation(api.legal.mutations.acceptManagerLegalConsent);
  const createRecruitment = useMutation(api.recruitment.mutations.createRecruitment);
  const deleteRecruitmentMut = useMutation(api.recruitment.mutations.deleteRecruitment);
  const addStaffs = useMutation(api.staff.mutations.addStaffs);
  const editStaffMut = useMutation(api.staff.mutations.editStaff);
  const deleteStaffMut = useMutation(api.staff.mutations.deleteStaff);
  const updateShopSettings = useMutation(api.shop.mutations.updateShopSettings);
  const generateLineLinkToken = useMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useMutation(api.line.mutations.sendInvite);
  const ensureShopRegistrationLink = useMutation(api.staffRegistration.mutations.ensureShopRegistrationLink);
  const approveStaffRequest = useMutation(api.staffRegistration.mutations.approveRequest);
  const rejectStaffRequest = useMutation(api.staffRegistration.mutations.rejectRequest);
  const dismissOnboarding = useMutation(api.dashboard.mutations.dismissOnboarding);

  useEffect(() => {
    if (pendingStaffRequests.length === 0 || isDashboardOnboardingDismissed || autoDismissedOnboarding) return;
    setAutoDismissedOnboarding(true);
    setDismissedOnboardingStages(COMPLETED_ONBOARDING_STAGES);
    dismissOnboarding({}).catch(showErrorToast);
  }, [autoDismissedOnboarding, dismissOnboarding, isDashboardOnboardingDismissed, pendingStaffRequests.length]);

  useEffect(() => {
    if (!staffRegistrationDialog.isOpen || pendingStaffRequests.length > 0) return;
    staffRegistrationDialog.close();
  }, [pendingStaffRequests.length, staffRegistrationDialog.close, staffRegistrationDialog.isOpen]);

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

  const { run: handleSetupComplete, isRunning: isSetupSubmitting } = useSingleFlight(async (data: SetupData) => {
    try {
      await setupShopAndManager({
        shopName: data.shopName,
        submissionPattern: data.submissionPattern,
        managerName: data.name,
        managerEmail: data.email,
        acceptedLegal: data.acceptedLegal as true,
      });
      toaster.create({ title: "セットアップが完了しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleCreateRecruitment } = useSingleFlight(async (data: CreateRecruitmentData) => {
    try {
      await createRecruitment(data);
      recruitmentModal.close();
      toaster.create({ title: "募集をつくりました", type: "success" });
    } catch (error) {
      const message = getCreateRecruitmentErrorMessage(error);
      if (message) {
        toaster.create({ title: message, type: "error", duration: Number.POSITIVE_INFINITY });
        return;
      }
      showErrorToast(error);
    }
  });

  const handleDeleteRecruitmentClick = (recruitment: Recruitment) => {
    setDeleteRecruitmentTarget(recruitment);
    deleteRecruitmentDialog.open();
  };

  const { run: handleDeleteRecruitment, isRunning: isDeletingRecruitment } = useSingleFlight(async () => {
    if (!deleteRecruitmentTarget) return;
    try {
      await deleteRecruitmentMut({ recruitmentId: deleteRecruitmentTarget._id });
      deleteRecruitmentDialog.close();
      setDeleteRecruitmentTarget(null);
      toaster.create({ title: "シフト募集を削除しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleAcceptManagerLegalConsent, isRunning: legalConsentSubmitting } = useSingleFlight(async () => {
    try {
      await acceptManagerLegalConsent({ acceptedLegal: true });
      toaster.create({ title: "同意を記録しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleAddStaffs, isRunning: isAddingStaffs } = useSingleFlight(
    async (data: { entries: Array<{ name: string; email: string }> }) => {
      try {
        await addStaffs({ entries: data.entries });
        staffModal.close();
        toaster.create({ title: "スタッフを追加しました", type: "success" });
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

  const handleOpenStaffModal = async () => {
    setStaffModalMode("qr");
    staffModal.open();
    setRegistrationUrlLoading(true);
    try {
      const result = await ensureShopRegistrationLink({});
      setRegistrationUrl(result.registrationUrl);
    } catch (error) {
      showErrorToast(error);
    } finally {
      setRegistrationUrlLoading(false);
    }
  };

  const handleStaffModalBackOrClose = () => {
    if (staffModalMode === "manual") {
      setStaffModalMode("qr");
      return;
    }
    staffModal.close();
  };

  const { run: handleApproveStaffRequest, isRunning: isApprovingStaffRequest } = useSingleFlight(
    async (request: StaffRegistrationRequest) => {
      try {
        await approveStaffRequest({ requestId: request._id });
        toaster.create({ title: "スタッフ申請を承認しました", type: "success" });
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

  const handleRejectStaffRequestClick = (request: StaffRegistrationRequest) => {
    setRejectRequestTarget(request);
  };

  const { run: handleRejectStaffRequest, isRunning: isRejectingStaffRequest } = useSingleFlight(async () => {
    if (!rejectRequestTarget) return;
    try {
      await rejectStaffRequest({ requestId: rejectRequestTarget._id });
      setRejectRequestTarget(null);
      toaster.create({ title: "スタッフ申請を却下しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const handleDismissOnboarding = async (stage: DashboardOnboardingStage) => {
    setDismissedOnboardingStages((current) => (current.includes(stage) ? current : [...current, stage]));
    try {
      await dismissOnboarding({});
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

  const { run: handleEditStaff, isRunning: isEditingStaff } = useSingleFlight(async (data: EditStaffFormData) => {
    if (!editTarget) return;
    try {
      await editStaffMut({ staffId: editTarget._id, name: data.name, email: data.email });
      editStaffModal.close();
      toaster.create({ title: "スタッフ情報を更新しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleUpdateShop } = useSingleFlight(async (data: EditShopFormData) => {
    try {
      await updateShopSettings(data);
      editShopModal.close();
      toaster.create({ title: "店舗設定を更新しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleDeleteStaff, isRunning: isDeletingStaff } = useSingleFlight(async () => {
    if (!deleteTarget) return;
    try {
      await deleteStaffMut({ staffId: deleteTarget._id });
      deleteStaffDialog.close();
      toaster.create({ title: "スタッフを削除しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

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

  const { run: handleSendLineInviteConfirm, isRunning: isSendingLineInvite } = useSingleFlight(async () => {
    if (!lineInviteTarget) return;
    try {
      await sendLineInvite({ staffId: lineInviteTarget._id });
      lineInviteDialog.close();
      toaster.create({ title: "LINE連携リンクをメールで送信しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

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
              staffRegistrationRequestBanner={
                pendingStaffRequests.length > 0 ? (
                  <StaffRegistrationRequestBanner
                    requestCount={pendingStaffRequests.length}
                    onClick={staffRegistrationDialog.open}
                  />
                ) : undefined
              }
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
                  onDismiss={handleDismissOnboarding}
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
              onAddClick={handleOpenStaffModal}
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

      <StepperDialog
        title="新しい募集をつくる"
        isOpen={recruitmentModal.isOpen}
        onOpenChange={recruitmentModal.onOpenChange}
        onClose={recruitmentModal.close}
      >
        <CreateRecruitmentForm
          regularClosedDays={shop?.regularClosedDays ?? []}
          submissionPattern={shop?.submissionPattern ?? { kind: "dateOnly" }}
          onSubmit={handleCreateRecruitment}
          onCancel={recruitmentModal.close}
        />
      </StepperDialog>

      <Dialog
        title={deleteRecruitmentTitle}
        isOpen={deleteRecruitmentDialog.isOpen}
        onOpenChange={deleteRecruitmentDialog.onOpenChange}
        onClose={deleteRecruitmentDialog.close}
        onSubmit={handleDeleteRecruitment}
        submitLabel="この募集を削除"
        role="alertdialog"
        submitColorPalette="red"
        isLoading={isDeletingRecruitment}
        isSubmitDisabled={isDeletingRecruitment}
      >
        <Text>本当に削除してよろしいですか？</Text>
      </Dialog>

      <Dialog
        title="スタッフを招待"
        isOpen={staffModal.isOpen}
        onOpenChange={staffModal.onOpenChange}
        formId={staffModalMode === "manual" ? "add-staff-form" : undefined}
        submitLabel={staffModalMode === "manual" ? "スタッフを追加する" : undefined}
        onClose={handleStaffModalBackOrClose}
        closeLabel={staffModalMode === "manual" ? "戻る" : "閉じる"}
        hideFooter={staffModalMode === "qr"}
        footer={
          staffModalMode === "manual" ? (
            <Flex w="full" align="center" justify="space-between" gap={3}>
              <Button variant="outline" onClick={handleStaffModalBackOrClose} disabled={isAddingStaffs}>
                戻る
              </Button>
              <Button type="submit" form="add-staff-form" colorPalette="teal" loading={isAddingStaffs}>
                スタッフを追加する
              </Button>
            </Flex>
          ) : undefined
        }
        maxW={{ base: "100vw", lg: "640px" }}
        maxH={{ base: "100dvh", lg: "85dvh" }}
        contentProps={{
          w: "100%",
          h: { base: "100dvh", lg: "auto" },
          my: { base: 0, lg: "auto" },
          borderRadius: { base: 0, lg: "l3" },
        }}
      >
        {staffModalMode === "qr" ? (
          <StaffRegistrationLinkPanel
            registrationUrl={registrationUrl}
            isLoading={registrationUrlLoading}
            manualEntryAction={
              <Button onClick={() => setStaffModalMode("manual")} size="sm" colorPalette="teal" gap={1.5}>
                <LuUserPlus />
                スタッフ情報を手入力する
              </Button>
            }
          />
        ) : (
          <AddStaffForm onSubmit={handleAddStaffs} />
        )}
      </Dialog>

      <StaffRegistrationRequestDialog
        isOpen={staffRegistrationDialog.isOpen}
        onOpenChange={staffRegistrationDialog.onOpenChange}
        onClose={staffRegistrationDialog.close}
        requests={pendingStaffRequests}
        onApprove={handleApproveStaffRequest}
        onReject={handleRejectStaffRequestClick}
        isApproving={isApprovingStaffRequest}
        isRejecting={isRejectingStaffRequest}
      />

      <Dialog
        title="スタッフ申請を却下"
        isOpen={rejectRequestTarget !== null}
        onOpenChange={({ open }) => {
          if (!open) setRejectRequestTarget(null);
        }}
        onClose={() => setRejectRequestTarget(null)}
        onSubmit={handleRejectStaffRequest}
        submitLabel="この申請を却下"
        role="alertdialog"
        submitColorPalette="red"
        isLoading={isRejectingStaffRequest}
        isSubmitDisabled={isRejectingStaffRequest}
      >
        <Text>「{rejectRequestTarget?.name}」さんの参加申請を却下しますか？</Text>
        <Text fontSize="sm" color="gray.600">
          却下してもスタッフには通知されません。必要な場合はシフト担当者から直接案内してください。
        </Text>
      </Dialog>

      <Dialog
        title="スタッフを編集"
        isOpen={editStaffModal.isOpen}
        onOpenChange={editStaffModal.onOpenChange}
        formId="edit-staff-form"
        submitLabel="変更を保存"
        onClose={editStaffModal.close}
        isLoading={isEditingStaff}
        isSubmitDisabled={isEditingStaff}
      >
        {editTarget && <EditStaffForm staff={editTarget} onSubmit={handleEditStaff} />}
      </Dialog>

      <StepperDialog
        title="店舗設定"
        isOpen={editShopModal.isOpen}
        onOpenChange={editShopModal.onOpenChange}
        onClose={editShopModal.close}
      >
        {shop && (
          <EditShopForm
            key={editShopModal.isOpen ? "edit-shop-open" : "edit-shop-closed"}
            defaultValues={{
              shopName: shop.name,
              regularClosedDays: shop.regularClosedDays,
              submissionPattern: shop.submissionPattern,
            }}
            onSubmit={handleUpdateShop}
            onCancel={editShopModal.close}
          />
        )}
      </StepperDialog>

      <Dialog
        title="スタッフを削除"
        isOpen={deleteStaffDialog.isOpen}
        onOpenChange={deleteStaffDialog.onOpenChange}
        onClose={deleteStaffDialog.close}
        onSubmit={handleDeleteStaff}
        submitLabel="このスタッフを削除"
        role="alertdialog"
        submitColorPalette="red"
        isLoading={isDeletingStaff}
        isSubmitDisabled={isDeletingStaff}
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
        isLoading={isSendingLineInvite}
        isSubmitDisabled={isSendingLineInvite}
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
          managerProfileDefaults={managerProfileDefaults}
          isSubmitting={isSetupSubmitting}
        />
      )}
    </>
  );
};

export const DashboardContentSkeleton = () => (
  <ContentWrapper>
    <HeroSummarySkeleton />
    <RecruitmentBoardSkeleton />
    <StaffRosterSkeleton />
  </ContentWrapper>
);

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
