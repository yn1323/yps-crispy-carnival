import { Alert, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { ManagerCandidateListView } from "./ManagerCandidateListView";
import { ManagerIssueConfirmationDialog } from "./ManagerIssueConfirmationDialog";
import type { ManagerSettingsCandidateResult, ReadyManagerSettingsOverview } from "./types";
import { useManagerIssueController } from "./useManagerIssueController";

type Props = {
  overview: ReadyManagerSettingsOverview;
  result: ManagerSettingsCandidateResult;
  shopId: string;
};

export function ManagerCandidatePageContent({ overview, result, shopId }: Props) {
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const controller = useManagerIssueController({ overview, shopId });

  const candidates = result.kind === "ready" ? result.candidates : [];
  useEffect(() => {
    setSelectedPersonId((current) =>
      candidates.some((candidate) => candidate.personId === current && candidate.canSelect) ? current : "",
    );
  }, [candidates]);

  useEffect(() => {
    if (controller.confirmation?.kind !== "existingStaff") return;
    const candidatePersonId = controller.confirmation.candidate.personId;
    if (!candidates.some((candidate) => candidate.personId === candidatePersonId && candidate.canSelect)) {
      controller.onCloseConfirmation();
    }
  }, [candidates, controller.confirmation, controller.onCloseConfirmation]);

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

  if (!overview.actions.canInviteExistingStaff) {
    return (
      <Alert.Root status="warning" borderRadius="lg" role="alert">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>既存スタッフを招待できません</Alert.Title>
          <Alert.Description>
            {overview.actions.existingStaffDisabledReason ?? "現在、既存スタッフへの管理者招待は利用できません。"}
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  const selected = candidates.find((candidate) => candidate.personId === selectedPersonId && candidate.canSelect);
  return (
    <Stack gap={5}>
      <ManagerCandidateListView
        candidates={candidates}
        selectedPersonId={selectedPersonId}
        isSubmitting={controller.isRunning}
        onSelect={setSelectedPersonId}
        onSubmit={() => {
          if (selected) controller.onRequestExistingStaff(selected);
        }}
      />
      <ManagerIssueConfirmationDialog
        confirmation={controller.confirmation}
        isRunning={controller.isRunning}
        onClose={controller.onCloseConfirmation}
        onConfirm={controller.onConfirm}
      />
    </Stack>
  );
}
