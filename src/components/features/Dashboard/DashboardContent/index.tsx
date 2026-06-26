import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { LuSparkles, LuUserPlus } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LineInviteConfirmContent } from "@/src/components/features/Line/LineInviteConfirmContent";
import { LineLinkQrDialog } from "@/src/components/features/Line/LineLinkQrDialog";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { Button } from "@/src/components/ui/Button";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { formatDateShort } from "@/src/domains/shift/date";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { AddStaffForm } from "../AddStaffForm/index.tsx";
import type { CreateRecruitmentData } from "../CreateRecruitmentForm/index";
import { CreateRecruitmentForm } from "../CreateRecruitmentForm/index.tsx";
import { getCreateRecruitmentErrorMessage } from "../createRecruitmentErrors";
import { DashboardAnnouncement } from "../DashboardAnnouncement";
import type { EditShopFormData } from "../EditShopForm/index";
import { EditShopForm } from "../EditShopForm/index.tsx";
import type { EditStaffFormData } from "../EditStaffForm/index";
import { EditStaffForm } from "../EditStaffForm/index.tsx";
import { HeroSummary, HeroSummarySkeleton, WelcomeHero } from "../HeroSummary";
import { LegalReconsentBanner } from "../LegalReconsentBanner";
import { type DashboardNotificationFailure, NotificationFailureDialogContent } from "../NotificationFailureDialog";
import { RecruitmentBoard, RecruitmentBoardSkeleton } from "../RecruitmentBoard";
import type { SetupData } from "../SetupModal";
import { SetupModal } from "../SetupModal";
import { StaffRegistrationLinkPanel } from "../StaffRegistrationLinkPanel";
import { StaffRegistrationRequestDialog } from "../StaffRegistrationRequests";
import { StaffRoster, StaffRosterSkeleton } from "../StaffRoster";
import {
  buildDashboardRecruitmentGroups,
  type DashboardAnnouncement as DashboardAnnouncementData,
  type DashboardRecruitmentGroup,
  type PaginationStatus,
  type Recruitment,
  type Staff,
  type StaffRegistrationRequest,
  sortRecruitmentsByCreatedAt,
} from "../types";
import { OnboardingCallout } from "./OnboardingCallout";
import {
  type DashboardOnboardingStage,
  deriveDashboardOnboardingState,
} from "./OnboardingCallout/deriveDashboardOnboardingState";
import { resendAllOpenNotificationFailuresBatches } from "./resendOpenNotificationFailures";

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
  recruitmentList?: Recruitment[];
  recruitmentGroups?: DashboardRecruitmentGroup[];
  currentRecruitments?: Recruitment[];
  recruitmentStatus: PaginationStatus;
  hasPastRecruitments?: boolean;
  isPastRecruitmentsVisible?: boolean;
  pastRecruitmentStatus?: PaginationStatus;
  canLoadMorePastRecruitments?: boolean;
  showPastRecruitments?: () => void;
  loadMorePastRecruitments?: () => void;
  staffs: Staff[];
  staffStatus: PaginationStatus;
  canLoadMoreStaffs: boolean;
  loadMoreStaffs: () => void;
  pendingStaffRequests?: StaffRegistrationRequest[];
  notificationFailures?: DashboardNotificationFailure[];
  isDashboardOnboardingDismissed?: boolean;
  announcement?: DashboardAnnouncementData | null;
};

export const DashboardContent = ({
  shop,
  managerProfileDefaults,
  managerLegalConsentStatus,
  recruitments,
  recruitmentList = recruitments,
  recruitmentGroups,
  currentRecruitments = [],
  hasPastRecruitments = false,
  isPastRecruitmentsVisible = false,
  pastRecruitmentStatus = "Exhausted",
  canLoadMorePastRecruitments = false,
  showPastRecruitments = () => {},
  loadMorePastRecruitments = () => {},
  staffs,
  staffStatus,
  canLoadMoreStaffs,
  loadMoreStaffs,
  pendingStaffRequests = [],
  notificationFailures = [],
  isDashboardOnboardingDismissed = false,
  announcement = null,
}: Props) => {
  const navigate = useNavigate();
  const recruitmentModal = useDialog();
  const staffModal = useDialog();
  const editStaffModal = useDialog();
  const editShopModal = useDialog();
  const deleteRecruitmentDialog = useDialog();
  const deleteStaffDialog = useDialog();
  const staffRegistrationDialog = useDialog();
  const notificationFailureDialog = useDialog();
  const lineQrDialog = useDialog();
  const lineInviteDialog = useDialog();
  const recruitmentNotificationDialog = useDialog();
  const currentShiftNotificationDialog = useDialog();
  const setupModal = useDialog();
  const isSetupRequired = shop === null;
  const [editTarget, setEditTarget] = useState<Staff | null>(null);
  const [deleteRecruitmentTarget, setDeleteRecruitmentTarget] = useState<Recruitment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
  const [lineQrTarget, setLineQrTarget] = useState<Staff | null>(null);
  const [lineQrAuthorizeUrl, setLineQrAuthorizeUrl] = useState<string | null>(null);
  const [lineQrLoading, setLineQrLoading] = useState(false);
  const [lineInviteTarget, setLineInviteTarget] = useState<Staff | null>(null);
  const [recruitmentNotificationTarget, setRecruitmentNotificationTarget] = useState<Staff | null>(null);
  const [currentShiftNotificationTarget, setCurrentShiftNotificationTarget] = useState<Staff | null>(null);
  const [staffModalMode, setStaffModalMode] = useState<"qr" | "manual">("qr");
  const [registrationUrl, setRegistrationUrl] = useState<string | null>(null);
  const [registrationUrlLoading, setRegistrationUrlLoading] = useState(false);
  const [rejectRequestTarget, setRejectRequestTarget] = useState<StaffRegistrationRequest | null>(null);
  const [notificationFailureDialogRows, setNotificationFailureDialogRows] = useState<DashboardNotificationFailure[]>(
    [],
  );
  const [acceptedNotificationFailureIds, setAcceptedNotificationFailureIds] = useState<
    Set<Id<"notificationFailureInbox">>
  >(() => new Set());
  const [resendingNotificationFailureIds, setResendingNotificationFailureIds] = useState<
    Set<Id<"notificationFailureInbox">>
  >(() => new Set());
  const [dismissedOnboardingStages, setDismissedOnboardingStages] = useState<DashboardOnboardingStage[]>([]);
  const [autoDismissedOnboarding, setAutoDismissedOnboarding] = useState(false);
  const [reviewedRecruitmentIds, setReviewedRecruitmentIds] = useState(readReviewedRecruitmentIds);
  const knownRecruitments = sortRecruitmentsByCreatedAt(
    Array.from(
      new Map([...recruitments, ...currentRecruitments].map((recruitment) => [recruitment._id, recruitment])).values(),
    ),
  );
  const latestKnownRecruitment = knownRecruitments[0];
  const shouldTreatOnboardingDismissed =
    isDashboardOnboardingDismissed || autoDismissedOnboarding || pendingStaffRequests.length > 0;
  const onboardingState = deriveDashboardOnboardingState({
    recruitments: knownRecruitments,
    staffs,
    dismissedStages: shouldTreatOnboardingDismissed ? COMPLETED_ONBOARDING_STAGES : dismissedOnboardingStages,
    reviewedRecruitmentIds,
  });
  const visibleOnboardingState =
    shop !== null && managerLegalConsentStatus?.required === false && onboardingState.kind === "visible"
      ? onboardingState
      : null;
  const shouldHideNextActionSection =
    (visibleOnboardingState !== null && notificationFailures.length === 0) ||
    (shop !== null && !managerLegalConsentStatus);
  const deleteRecruitmentTitle = deleteRecruitmentTarget
    ? `${formatDateShort(deleteRecruitmentTarget.periodStart)}〜${formatDateShort(
        deleteRecruitmentTarget.periodEnd,
      )}のシフト募集を削除`
    : "シフト募集を削除";
  const visibleRecruitmentGroups =
    recruitmentGroups ?? buildDashboardRecruitmentGroups({ recruitments: recruitmentList }).groups;

  // shop 未作成状態でも呼ぶため authenticatedMutation（shopId なし）
  const setupShopAndManager = useMutation(api.setup.mutations.setupShopAndManager);
  const dismissOnboarding = useMutation(api.dashboard.mutations.dismissOnboarding);
  // 以下は managerMutation。選択中店舗の shopId を自動注入する
  const acceptManagerLegalConsent = useShopMutation(api.legal.mutations.acceptManagerLegalConsent);
  const createRecruitment = useShopMutation(api.recruitment.mutations.createRecruitment);
  const deleteRecruitmentMut = useShopMutation(api.recruitment.mutations.deleteRecruitment);
  const addStaffs = useShopMutation(api.staff.mutations.addStaffs);
  const editStaffMut = useShopMutation(api.staff.mutations.editStaff);
  const deleteStaffMut = useShopMutation(api.staff.mutations.deleteStaff);
  const updateShopSettings = useShopMutation(api.shop.mutations.updateShopSettings);
  const generateLineLinkToken = useShopMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useShopMutation(api.line.mutations.sendInvite);
  const sendOpenRecruitmentNotifications = useShopMutation(api.staff.mutations.sendOpenRecruitmentNotifications);
  const sendCurrentShiftNotification = useShopMutation(api.staff.mutations.sendCurrentShiftNotification);
  const ensureShopRegistrationLink = useShopMutation(api.staffRegistration.mutations.ensureShopRegistrationLink);
  const approveStaffRequest = useShopMutation(api.staffRegistration.mutations.approveRequest);
  const rejectStaffRequest = useShopMutation(api.staffRegistration.mutations.rejectRequest);
  const resendNotificationFailure = useShopMutation(api.notificationOutbox.mutations.resendFailure);
  const resendOpenNotificationFailures = useShopMutation(api.notificationOutbox.mutations.resendOpenFailures);

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

  useEffect(() => {
    if (!notificationFailureDialog.isOpen) return;
    setNotificationFailureDialogRows((currentRows) => {
      const nextRowsById = new Map(currentRows.map((failure) => [failure._id, failure]));
      for (const failure of notificationFailures) {
        nextRowsById.set(failure._id, failure);
      }
      return Array.from(nextRowsById.values()).filter(
        (failure) =>
          acceptedNotificationFailureIds.has(failure._id) ||
          notificationFailures.some((openFailure) => openFailure._id === failure._id),
      );
    });
  }, [acceptedNotificationFailureIds, notificationFailureDialog.isOpen, notificationFailures]);

  const handleOpenShiftBoard = (recruitmentId: string) => {
    if (visibleOnboardingState?.stage === "review_submission" && latestKnownRecruitment?._id === recruitmentId) {
      setReviewedRecruitmentIds((current) => {
        if (current.includes(recruitmentId)) return current;
        const next = [...current, recruitmentId];
        writeReviewedRecruitmentIds(next);
        return next;
      });
    }
    navigate({ to: "/shiftboard/$recruitmentId", params: { recruitmentId } });
  };

  const handleOpenNotificationFailures = () => {
    setNotificationFailureDialogRows(notificationFailures);
    setAcceptedNotificationFailureIds(new Set());
    setResendingNotificationFailureIds(new Set());
    notificationFailureDialog.open();
  };

  const handleNotificationFailureDialogOpenChange = (details: { open: boolean }) => {
    notificationFailureDialog.onOpenChange(details);
    if (details.open) return;
    setNotificationFailureDialogRows([]);
    setAcceptedNotificationFailureIds(new Set());
    setResendingNotificationFailureIds(new Set());
  };

  const handleCloseNotificationFailures = () => {
    notificationFailureDialog.close();
    setNotificationFailureDialogRows([]);
    setAcceptedNotificationFailureIds(new Set());
    setResendingNotificationFailureIds(new Set());
  };

  const handleResendNotificationFailure = async (failureId: Id<"notificationFailureInbox">) => {
    if (
      acceptedNotificationFailureIds.has(failureId) ||
      resendingNotificationFailureIds.has(failureId) ||
      isResendingAllNotificationFailures
    ) {
      return;
    }
    setResendingNotificationFailureIds((current) => new Set(current).add(failureId));
    try {
      const result = await resendNotificationFailure({ failureId });
      if (result.scheduled) {
        setAcceptedNotificationFailureIds((current) => new Set(current).add(failureId));
        toaster.create({ title: "再通知を受け付けました", type: "success" });
        return;
      }
      toaster.create({
        title: result.reason === "rateLimited" ? "少し時間をおいて再通知してください" : "再通知できませんでした",
        type: result.reason === "rateLimited" ? "error" : "info",
      });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setResendingNotificationFailureIds((current) => {
        const next = new Set(current);
        next.delete(failureId);
        return next;
      });
    }
  };

  const { run: handleResendAllNotificationFailures, isRunning: isResendingAllNotificationFailures } = useSingleFlight(
    async () => {
      const retryableFailures = notificationFailureDialogRows.filter(
        (failure) => failure.canRetry && !acceptedNotificationFailureIds.has(failure._id),
      );
      if (retryableFailures.length === 0) return;

      try {
        const result = await resendAllOpenNotificationFailuresBatches(() => resendOpenNotificationFailures({}));
        if (result.scheduledFailureIds.length > 0) {
          setAcceptedNotificationFailureIds((current) => {
            const next = new Set(current);
            for (const failureId of result.scheduledFailureIds) {
              next.add(failureId);
            }
            return next;
          });
          toaster.create({
            title: result.hasRemainingFailures
              ? "一部の再送を受け付けました"
              : "送れなかった通知の再送を受け付けました",
            description: result.hasRemainingFailures
              ? "残りの通知は少し時間をおいてから、もう一度再通知してください。"
              : undefined,
            type: result.hasRemainingFailures ? "warning" : "success",
          });
          return;
        }
        toaster.create({
          title: result.hasRemainingFailures ? "一部の通知を再送できませんでした" : "再送できる通知がありません",
          description: result.hasRemainingFailures
            ? "残りの通知は少し時間をおいてから、もう一度再通知してください。"
            : undefined,
          type: result.hasRemainingFailures ? "warning" : "info",
        });
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

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
      toaster.create({
        title: "募集をつくり、スタッフに通知しました",
        description: "LINE連携済みのスタッフにはLINE、未連携のスタッフにはメールで届きます。",
        type: "success",
      });
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
        toaster.create({
          title: "スタッフを追加し、案内通知を送りました",
          description: "同意依頼とLINE連携案内をメールで送りました。募集中シフトがある場合は提出リンクも届きます。",
          type: "success",
        });
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
        toaster.create({
          title: "スタッフ申請を承認し、案内通知を送りました",
          description: "LINE連携案内をメールで送りました。募集中シフトがある場合は提出リンクも届きます。",
          type: "success",
        });
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
      toaster.create({ title: "LINE連携リンクをメールで送りました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const handleSendRecruitmentsClick = (staff: Staff) => {
    setRecruitmentNotificationTarget(staff);
    recruitmentNotificationDialog.open();
  };

  const { run: handleSendRecruitmentsConfirm, isRunning: isSendingRecruitments } = useSingleFlight(async () => {
    if (!recruitmentNotificationTarget) return;
    try {
      const result = await sendOpenRecruitmentNotifications({ staffId: recruitmentNotificationTarget._id });
      recruitmentNotificationDialog.close();
      if (result.scheduled) {
        toaster.create({ title: "シフト募集通知を送りました", type: "success" });
        return;
      }
      toaster.create({
        title:
          result.reason === "rateLimited" ? "少し時間をおいて再送してください" : "送信できるシフト募集がありません",
        type: result.reason === "rateLimited" ? "error" : "info",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const handleSendCurrentShiftClick = (staff: Staff) => {
    setCurrentShiftNotificationTarget(staff);
    currentShiftNotificationDialog.open();
  };

  const { run: handleSendCurrentShiftConfirm, isRunning: isSendingCurrentShift } = useSingleFlight(async () => {
    if (!currentShiftNotificationTarget) return;
    try {
      const result = await sendCurrentShiftNotification({ staffId: currentShiftNotificationTarget._id });
      currentShiftNotificationDialog.close();
      if (result.scheduled) {
        toaster.create({ title: "現在の確定シフトを送りました", type: "success" });
        return;
      }
      toaster.create({
        title:
          result.reason === "rateLimited"
            ? "少し時間をおいて再送してください"
            : "送信できる現在の確定シフトがありません",
        type: result.reason === "rateLimited" ? "error" : "info",
      });
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
              hasNotificationFailures={notificationFailures.length > 0}
              onNotificationFailuresClick={handleOpenNotificationFailures}
              announcementBanner={announcement ? <DashboardAnnouncement announcement={announcement} /> : undefined}
              staffRegistrationRequest={
                pendingStaffRequests.length > 0
                  ? { count: pendingStaffRequests.length, onClick: staffRegistrationDialog.open }
                  : undefined
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
              groups={visibleRecruitmentGroups}
              pastStatus={pastRecruitmentStatus}
              hasPastRecruitments={hasPastRecruitments}
              isPastRecruitmentsVisible={isPastRecruitmentsVisible}
              canLoadMorePastRecruitments={canLoadMorePastRecruitments}
              tourRecruitmentId={latestKnownRecruitment?._id}
              onCreateClick={recruitmentModal.open}
              onOpenShiftBoard={handleOpenShiftBoard}
              onDeleteRecruitment={handleDeleteRecruitmentClick}
              onShowPastRecruitments={showPastRecruitments}
              onLoadMorePastRecruitments={loadMorePastRecruitments}
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
              onSendRecruitments={handleSendRecruitmentsClick}
              onSendCurrentShift={handleSendCurrentShiftClick}
              hasCurrentShift={currentRecruitments.length > 0}
              onLoadMore={loadMoreStaffs}
            />
          </>
        ) : (
          <>
            {announcement && <DashboardAnnouncement announcement={announcement} />}
            <WelcomeHero onSetupClick={setupModal.open} />
          </>
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
        <Text>この募集を削除すると元に戻せません。</Text>
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

      <Dialog
        title="シフト募集通知を送る"
        isOpen={recruitmentNotificationDialog.isOpen}
        onOpenChange={recruitmentNotificationDialog.onOpenChange}
        onClose={recruitmentNotificationDialog.close}
        onSubmit={handleSendRecruitmentsConfirm}
        submitLabel="現在の募集中シフトを送る"
        isLoading={isSendingRecruitments}
        isSubmitDisabled={isSendingRecruitments}
      >
        {recruitmentNotificationTarget && (
          <NotificationResendConfirmContent
            staff={recruitmentNotificationTarget}
            description="現在送れる募集中シフトの通知を送ります。"
            note="通常はシフト作成時に自動で通知しています。届いていない場合のみ再送してください。"
          />
        )}
      </Dialog>

      <Dialog
        title="現在の確定シフトを送る"
        isOpen={currentShiftNotificationDialog.isOpen}
        onOpenChange={currentShiftNotificationDialog.onOpenChange}
        onClose={currentShiftNotificationDialog.close}
        onSubmit={handleSendCurrentShiftConfirm}
        submitLabel="確定シフトを送る"
        isLoading={isSendingCurrentShift}
        isSubmitDisabled={isSendingCurrentShift}
      >
        {currentShiftNotificationTarget && (
          <NotificationResendConfirmContent
            staff={currentShiftNotificationTarget}
            description="現在の期間に含まれる確定済みシフトを送ります。"
            note="通常はシフト確定時に自動で通知しています。届いていない場合のみ再送してください。"
          />
        )}
      </Dialog>

      <Dialog
        title="送れなかった通知"
        isOpen={notificationFailureDialog.isOpen}
        onOpenChange={handleNotificationFailureDialogOpenChange}
        onClose={handleCloseNotificationFailures}
        footer={
          <Button variant="outline" onClick={handleCloseNotificationFailures} w={{ base: "100%", md: "auto" }}>
            閉じる
          </Button>
        }
        maxW={{ base: "100vw", lg: "960px" }}
        maxH={{ base: "100dvh", lg: "82dvh" }}
        contentProps={{
          w: "100%",
          h: { base: "100dvh", lg: "auto" },
          my: { base: 0, lg: "auto" },
          borderRadius: { base: 0, lg: "l3" },
        }}
      >
        <NotificationFailureDialogContent
          failures={notificationFailureDialogRows}
          acceptedFailureIds={acceptedNotificationFailureIds}
          resendingFailureIds={resendingNotificationFailureIds}
          isResendingAll={isResendingAllNotificationFailures}
          onResend={handleResendNotificationFailure}
          onResendAll={handleResendAllNotificationFailures}
        />
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

const NotificationResendConfirmContent = ({
  staff,
  description,
  note,
}: {
  staff: Staff;
  description: string;
  note: string;
}) => (
  <Stack gap={3}>
    <Text fontSize="sm" color="gray.800">
      {staff.name}さん{staff.email ? `（${staff.email}）` : ""}に{description}
    </Text>
    <Text fontSize="xs" color="fg.muted" lineHeight="tall">
      {note}
    </Text>
  </Stack>
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
