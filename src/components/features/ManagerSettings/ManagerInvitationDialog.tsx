import { Alert, Skeleton, Stack } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/src/components/ui/Dialog";
import { ManagerCandidateListView } from "./ManagerCandidateListView";
import { ManagerExternalInviteFormView } from "./ManagerExternalInviteForm";
import { ManagerIssueConfirmationContent } from "./ManagerIssueConfirmationDialog";
import type {
  ManagerInvitationIssueConfirmation,
  ManagerSettingsCandidate,
  ManagerSettingsCandidateResult,
  ReadyManagerSettingsOverview,
} from "./types";
import { useManagerIssueController } from "./useManagerIssueController";

export type ManagerInvitationDialogMode = "existingStaff" | "external";

type ExternalInviteDraft = {
  name: string;
  email: string;
};

type ManagerInvitationDialogProps = {
  mode: ManagerInvitationDialogMode | null;
  overview: ReadyManagerSettingsOverview;
  organizationId: Id<"organizations">;
  onClose: () => void;
};

export function ManagerInvitationDialog({ mode, overview, organizationId, onClose }: ManagerInvitationDialogProps) {
  const [now] = useState(() => Date.now());
  const candidateResult = useQuery(
    api.appOrganization.manageQueries.getManagerCandidates,
    mode === "existingStaff" ? { organizationId, now } : "skip",
  );
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [externalDraft, setExternalDraft] = useState<ExternalInviteDraft>({ name: "", email: "" });
  const controller = useManagerIssueController({ overview, organizationId, onCompleted: onClose });

  useEffect(() => {
    if (mode !== "existingStaff" || candidateResult?.kind !== "ready") {
      setExternalDraft({ name: "", email: "" });
      setSelectedPersonId("");
      return;
    }
    setExternalDraft({ name: "", email: "" });
    setSelectedPersonId((current) =>
      candidateResult.candidates.some((candidate) => candidate.personId === current && candidate.canSelect)
        ? current
        : "",
    );
  }, [candidateResult, mode]);

  useEffect(() => {
    const confirmation = controller.confirmation;
    if (confirmation?.kind !== "existingStaff") return;
    if (
      mode !== "existingStaff" ||
      candidateResult?.kind !== "ready" ||
      !candidateResult.candidates.some(
        (candidate) => candidate.personId === confirmation.candidate.personId && candidate.canSelect,
      )
    ) {
      controller.onCloseConfirmation();
    }
  }, [candidateResult, controller.confirmation, controller.onCloseConfirmation, mode]);

  return (
    <ManagerInvitationDialogView
      mode={mode}
      overview={overview}
      candidateResult={candidateResult}
      confirmation={controller.confirmation}
      isRunning={controller.isRunning}
      selectedPersonId={selectedPersonId}
      externalDraft={externalDraft}
      onSelectCandidate={setSelectedPersonId}
      onRequestExistingStaff={controller.onRequestExistingStaff}
      onRequestExternal={(name, email) => {
        setExternalDraft({ name, email });
        controller.onRequestExternal(name, email);
      }}
      onClose={onClose}
      onCloseConfirmation={controller.onCloseConfirmation}
      onConfirm={controller.onConfirm}
    />
  );
}

export type ManagerInvitationDialogViewProps = {
  mode: ManagerInvitationDialogMode | null;
  overview: ReadyManagerSettingsOverview;
  candidateResult?: ManagerSettingsCandidateResult;
  confirmation: ManagerInvitationIssueConfirmation;
  isRunning: boolean;
  selectedPersonId: string;
  externalDraft: ExternalInviteDraft;
  onSelectCandidate: (personId: string) => void;
  onRequestExistingStaff: (candidate: ManagerSettingsCandidate) => void;
  onRequestExternal: (invitedName: string, email: string) => void;
  onClose: () => void;
  onCloseConfirmation: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ManagerInvitationDialogView({
  mode,
  overview,
  candidateResult,
  confirmation,
  isRunning,
  selectedPersonId,
  externalDraft,
  onSelectCandidate,
  onRequestExistingStaff,
  onRequestExternal,
  onClose,
  onCloseConfirmation,
  onConfirm,
}: ManagerInvitationDialogViewProps) {
  const isOpen = mode !== null;
  const resolvedMode = mode ?? "external";
  const isConfirmation = isOpen && confirmation !== null;
  const isExistingStaff = resolvedMode === "existingStaff";
  const selectedCandidate =
    candidateResult?.kind === "ready"
      ? candidateResult.candidates.find((candidate) => candidate.personId === selectedPersonId && candidate.canSelect)
      : undefined;
  const canInviteExistingStaff =
    isOpen && overview.mode === "managerAddition" && overview.actions.canInviteExistingStaff;
  const canInviteExternal = isOpen && overview.mode === "managerAddition" && overview.actions.canInviteExternal;
  const externalFormId = "manager-external-invitation-form";
  const isSubmitDisabled = isConfirmation
    ? false
    : !isOpen
      ? true
      : isExistingStaff
        ? !canInviteExistingStaff || !selectedCandidate || candidateResult?.kind !== "ready"
        : !canInviteExternal;

  const handleClose = () => {
    if (isConfirmation) {
      onCloseConfirmation();
      return;
    }
    onClose();
  };

  const handleSubmit = () => {
    if (isConfirmation) {
      onConfirm();
      return;
    }
    if (selectedCandidate) onRequestExistingStaff(selectedCandidate);
  };

  return (
    <Dialog
      title={getDialogTitle(resolvedMode, confirmation)}
      role={isConfirmation ? "alertdialog" : "dialog"}
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open && isOpen && !isRunning) handleClose();
      }}
      onClose={handleClose}
      onSubmit={isOpen && (isExistingStaff || isConfirmation) ? handleSubmit : undefined}
      formId={isOpen && !isExistingStaff && !isConfirmation ? externalFormId : undefined}
      closeLabel={isConfirmation ? "やめる" : "キャンセル"}
      submitLabel={getSubmitLabel(resolvedMode, confirmation)}
      isLoading={isRunning}
      isSubmitDisabled={isSubmitDisabled}
      preventClose={isRunning}
      unmountOnExit
      mobileActionLayout="stacked"
      mobileFullScreen
      maxW={{ base: "calc(100vw - 24px)", md: "640px" }}
      maxH={{ base: "calc(100dvh - 24px)", md: "80dvh" }}
    >
      {isConfirmation ? (
        <ManagerIssueConfirmationContent confirmation={confirmation} />
      ) : !isOpen ? null : isExistingStaff ? (
        <ExistingStaffInvitationContent
          overview={overview}
          result={candidateResult}
          selectedPersonId={selectedPersonId}
          isSubmitting={isRunning}
          onSelect={onSelectCandidate}
          onSubmit={handleSubmit}
        />
      ) : (
        <ManagerExternalInviteFormView
          isSubmitting={isRunning}
          isReadOnly={!canInviteExternal}
          disabledReason={overview.actions.externalDisabledReason}
          defaultValues={externalDraft}
          formId={externalFormId}
          showSubmitAction={false}
          onRequestInvite={onRequestExternal}
        />
      )}
    </Dialog>
  );
}

function ExistingStaffInvitationContent({
  overview,
  result,
  selectedPersonId,
  isSubmitting,
  onSelect,
  onSubmit,
}: {
  overview: ReadyManagerSettingsOverview;
  result?: ManagerSettingsCandidateResult;
  selectedPersonId: string;
  isSubmitting: boolean;
  onSelect: (personId: string) => void;
  onSubmit: () => void;
}) {
  if (result === undefined) {
    return (
      <Stack gap={4} aria-label="管理者候補を読み込み中" aria-busy="true">
        <Stack gap={2}>
          <Skeleton h="24px" w="208px" maxW="80%" />
          <Skeleton h="18px" w="360px" maxW="100%" />
        </Stack>
        <Stack gap={3}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} h="72px" borderRadius="lg" />
          ))}
        </Stack>
      </Stack>
    );
  }

  if (result.kind !== "ready") {
    return (
      <Alert.Root status="error" borderRadius="lg" role="alert">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>管理者候補を表示できません</Alert.Title>
          <Alert.Description>{result.message}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  if (overview.mode !== "managerAddition" || !overview.actions.canInviteExistingStaff) {
    return (
      <Alert.Root status="warning" borderRadius="lg" role="alert">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>既存スタッフを招待できません</Alert.Title>
          <Alert.Description>
            {overview.mode === "freeManagerExchange"
              ? "以前の管理者交代機能は終了しました。送信済みの交代招待を取り消すか、有効期限が切れてから画面を更新してください。"
              : (overview.actions.existingStaffDisabledReason ?? "現在、既存スタッフへの管理者招待は利用できません。")}
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  return (
    <ManagerCandidateListView
      candidates={result.candidates}
      selectedPersonId={selectedPersonId}
      isSubmitting={isSubmitting}
      onSelect={onSelect}
      onSubmit={onSubmit}
      showSubmitAction={false}
    />
  );
}

function getDialogTitle(mode: ManagerInvitationDialogMode, confirmation: ManagerInvitationIssueConfirmation) {
  if (confirmation) {
    return confirmation.kind === "existingStaff"
      ? `${confirmation.candidate.name}さんを招待しますか？`
      : "新しい管理者を招待しますか？";
  }
  return mode === "existingStaff" ? "既存スタッフを管理者として招待" : "新しいユーザーを管理者として招待";
}

function getSubmitLabel(mode: ManagerInvitationDialogMode, confirmation: ManagerInvitationIssueConfirmation) {
  if (confirmation) return "招待する";
  return mode === "existingStaff" ? "管理者として招待する" : "招待内容を確認する";
}
