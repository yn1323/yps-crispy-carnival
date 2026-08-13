import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type {
  ManagerInvitationIssueConfirmation,
  ManagerSettingsCandidate,
  ReadyManagerSettingsOverview,
} from "./types";

export function useManagerIssueController({
  overview,
  shopId,
}: {
  overview: ReadyManagerSettingsOverview;
  shopId: string;
}) {
  const navigate = useNavigate();
  const issue = useShopMutation(api.organizationInvitation.mutations.issue);
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
        const result = await issue({
          recipient:
            current.kind === "existingStaff"
              ? { kind: "existingStaff", personId: current.candidate.personId }
              : { kind: "external", invitedName: current.invitedName, email: current.email },
          requestId: current.requestId,
        });
        setConfirmation(null);
        showSuccessToast({
          title: result.status === "alreadyPending" ? "この管理者招待は送信済みです" : "送信を受け付けました",
        });
        void navigate({ to: "/settings/managers", search: { shop: shopId }, replace: true });
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
