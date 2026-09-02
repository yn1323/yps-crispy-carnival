import { Alert, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { ManagerCandidateListView } from "./ManagerCandidateListView";
import type { ManagerSettingsCandidate, ManagerSettingsCandidateResult, ReadyManagerSettingsOverview } from "./types";
import { useManagerIssueController } from "./useManagerIssueController";

type Props = {
  overview: ReadyManagerSettingsOverview;
  result: ManagerSettingsCandidateResult;
  organizationId: Id<"organizations">;
};

export function ManagerCandidatePageContent({ overview, result, organizationId }: Props) {
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const controller = useManagerIssueController({ overview, organizationId });

  const candidates = result.kind === "ready" ? result.candidates : [];
  useEffect(() => {
    setSelectedPersonId((current) =>
      candidates.some((candidate: ManagerSettingsCandidate) => candidate.personId === current && candidate.canSelect)
        ? current
        : "",
    );
  }, [candidates]);

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

  const selected = candidates.find(
    (candidate: ManagerSettingsCandidate) => candidate.personId === selectedPersonId && candidate.canSelect,
  );
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
    </Stack>
  );
}
