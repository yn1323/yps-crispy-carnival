import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ManagerSettingsCandidate, ReadyManagerSettingsOverview } from "./types";

type ManagerInvitationIssueRequest =
  | {
      kind: "existingStaff";
      candidate: ManagerSettingsCandidate;
      requestId: string;
    }
  | {
      kind: "external";
      invitedName: string;
      email: string;
      requestId: string;
    };

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
  const latestOverviewRef = useRef(overview);
  const lastExistingStaffRequestRef = useRef<{ personId: Id<"organizationPeople">; requestId: string } | null>(null);
  const lastExternalRequestRef = useRef<{ invitedName: string; email: string; requestId: string } | null>(null);
  latestOverviewRef.current = overview;

  const { run, isRunning } = useSingleFlight(async (current: ManagerInvitationIssueRequest): Promise<boolean> => {
    const latest = latestOverviewRef.current;
    if (!isIssueRequestAllowed(current, latest)) return false;

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
      showSuccessToast({
        title: result.status === "alreadyPending" ? "この管理者招待は送信済みです" : "送信を受け付けました",
      });
      if (onCompleted) {
        onCompleted();
      } else {
        void navigate({ to: "/manage/managers", search: { org: organizationId }, replace: true });
      }
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    }
  });

  return {
    isRunning,
    onRequestExistingStaff: (candidate: ManagerSettingsCandidate) => {
      if (!candidate.canSelect || !latestOverviewRef.current.actions.canInviteExistingStaff) {
        return;
      }
      const previous = lastExistingStaffRequestRef.current;
      const requestId = previous && previous.personId === candidate.personId ? previous.requestId : crypto.randomUUID();
      const request = {
        kind: "existingStaff",
        candidate,
        requestId,
      } as const;
      lastExistingStaffRequestRef.current = { personId: candidate.personId, requestId };
      void run(request).then((succeeded) => {
        if (succeeded && lastExistingStaffRequestRef.current?.requestId === requestId) {
          lastExistingStaffRequestRef.current = null;
        }
      });
    },
    onRequestExternal: (invitedName: string, email: string) => {
      if (!latestOverviewRef.current.actions.canInviteExternal) {
        return;
      }
      const previous = lastExternalRequestRef.current;
      const requestId =
        previous?.invitedName === invitedName && previous.email === email ? previous.requestId : crypto.randomUUID();
      const request = { kind: "external" as const, invitedName, email, requestId };
      lastExternalRequestRef.current = request;
      void run(request).then((succeeded) => {
        if (succeeded && lastExternalRequestRef.current?.requestId === requestId) {
          lastExternalRequestRef.current = null;
        }
      });
    },
  };
}

function isIssueRequestAllowed(request: ManagerInvitationIssueRequest, overview: ReadyManagerSettingsOverview) {
  if (request.kind === "existingStaff") {
    return overview.actions.canInviteExistingStaff;
  }
  return overview.actions.canInviteExternal;
}
