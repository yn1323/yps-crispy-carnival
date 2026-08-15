import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type {
  ManagerInvitationIssueConfirmation,
  ManagerSettingsCandidate,
  ReadyManagerSettingsOverview,
} from "./types";

export function useManagerIssueController({
  overview,
  organizationId,
  onCompleted,
}: {
  overview: ReadyManagerSettingsOverview;
  organizationId: Id<"organizations">;
  onCompleted?: () => void;
}) {
  const navigate = useNavigate();
  const issueForOrganization = useMutation(api.organizationInvitation.mutations.issueForOrganization);
  const [confirmation, setConfirmation] = useState<ManagerInvitationIssueConfirmation>(null);
  const latestOverviewRef = useRef(overview);
  latestOverviewRef.current = overview;

  useEffect(() => {
    setConfirmation((current) => (current && isIssueConfirmationAllowed(current, overview) ? current : null));
  }, [overview]);

  const { run, isRunning } = useSingleFlight(
    async (current: Exclude<ManagerInvitationIssueConfirmation, null>): Promise<boolean> => {
      const latest = latestOverviewRef.current;
      if (!isIssueConfirmationAllowed(current, latest)) {
        setConfirmation(null);
        return false;
      }

      try {
        const recipient:
          | { kind: "existingStaff"; personId: Id<"organizationPeople"> }
          | { kind: "external"; invitedName: string; email: string } =
          current.kind === "existingStaff"
            ? { kind: "existingStaff", personId: current.candidate.personId }
            : { kind: "external", invitedName: current.invitedName, email: current.email };
        const args = {
          recipient,
          requestId: current.requestId,
        };
        const result = await issueForOrganization({ organizationId, ...args });
        setConfirmation(null);
        showSuccessToast({
          title: result.status === "alreadyPending" ? "この管理者招待は送信済みです" : "送信を受け付けました",
        });
        if (onCompleted) {
          onCompleted();
        } else {
          void navigate({ to: "/app/manage/managers", search: { org: organizationId }, replace: true });
        }
        return true;
      } catch (error) {
        showErrorToast(error);
        return false;
      }
    },
  );

  return {
    confirmation,
    isRunning,
    onRequestExistingStaff: (candidate: ManagerSettingsCandidate) => {
      if (
        !candidate.canSelect ||
        latestOverviewRef.current.mode !== "managerAddition" ||
        !latestOverviewRef.current.actions.canInviteExistingStaff
      ) {
        return;
      }
      setConfirmation({
        kind: "existingStaff",
        candidate,
        mode: latestOverviewRef.current.mode,
        requestId: crypto.randomUUID(),
      });
    },
    onRequestExternal: (invitedName: string, email: string) => {
      if (
        latestOverviewRef.current.mode !== "managerAddition" ||
        !latestOverviewRef.current.actions.canInviteExternal
      ) {
        return;
      }
      setConfirmation({ kind: "external", invitedName, email, requestId: crypto.randomUUID() });
    },
    onCloseConfirmation: () => {
      if (!isRunning) setConfirmation(null);
    },
    onConfirm: () => {
      if (confirmation) void run(confirmation);
    },
  };
}

function isIssueConfirmationAllowed(
  confirmation: Exclude<ManagerInvitationIssueConfirmation, null>,
  overview: ReadyManagerSettingsOverview,
) {
  if (confirmation.kind === "existingStaff") {
    return (
      overview.mode === "managerAddition" &&
      overview.actions.canInviteExistingStaff &&
      confirmation.mode === overview.mode
    );
  }
  return overview.mode === "managerAddition" && overview.actions.canInviteExternal;
}
