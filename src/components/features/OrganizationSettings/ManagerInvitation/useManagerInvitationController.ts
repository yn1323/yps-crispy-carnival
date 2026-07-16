import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import {
  classifyPeopleCapacityError,
  type PeopleCapacityResolution,
} from "@/src/domains/organizationBilling/peopleCapacity";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { ManagerInvitationView } from "../types";

type Input = {
  canInviteManager: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  invitations: ManagerInvitationView[];
};

type Operation =
  | { kind: "create"; email: string }
  | { kind: "resend"; invitationId: Id<"organizationInvitations"> }
  | { kind: "revoke"; invitationId: Id<"organizationInvitations"> };

export function useManagerInvitationController(input: Input) {
  const createInvitation = useShopMutation(api.organizationInvitation.mutations.create);
  const resendInvitation = useShopMutation(api.organizationInvitation.mutations.resend);
  const revokeInvitation = useShopMutation(api.organizationInvitation.mutations.revoke);
  const [isOpen, setIsOpen] = useState(false);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (input.canInviteManager) return;
    setIsOpen(false);
    setPeopleCapacityResolution(null);
  }, [input.canInviteManager]);

  const { run, isRunning } = useSingleFlight(async (operation: Operation) => {
    const latest = latestRef.current;
    if (operation.kind === "create") {
      const isCurrentCandidate =
        latest.managerInvitationMode === "addition" ||
        latest.freeManagerExchangeCandidates.some((candidate) => candidate.email === operation.email);
      if (!latest.canInviteManager || !isCurrentCandidate) {
        setIsOpen(false);
        setPeopleCapacityResolution(null);
        return;
      }
    } else {
      const invitation = latest.invitations.find((candidate) => candidate.id === operation.invitationId);
      const canRun = operation.kind === "resend" ? invitation?.canResend : invitation?.canRevoke;
      if (!canRun) return;
    }

    const requestId = crypto.randomUUID();
    if (operation.kind === "create") setPeopleCapacityResolution(null);
    try {
      switch (operation.kind) {
        case "create":
          await createInvitation({ email: operation.email, requestId });
          showSuccessToast({
            title:
              latest.managerInvitationMode === "freeManagerExchange"
                ? "管理者交代の招待を送りました"
                : "管理者招待を送りました",
            description:
              latest.managerInvitationMode === "freeManagerExchange"
                ? "承認が完了するまでは、現在の管理者が操作を継続します。"
                : "招待は7日間有効です。管理者権限は承認後に追加されます。",
          });
          setIsOpen(false);
          break;
        case "resend":
          await resendInvitation({ invitationId: operation.invitationId, requestId });
          showSuccessToast({ title: "新しい管理者招待を送りました", description: "以前の招待URLは無効です。" });
          break;
        case "revoke":
          await revokeInvitation({ invitationId: operation.invitationId, requestId });
          showSuccessToast({ title: "管理者招待を取り消しました" });
          break;
      }
    } catch (error) {
      const resolution = classifyPeopleCapacityError(getConvexErrorMessage(error));
      if (operation.kind === "create" && resolution) {
        setPeopleCapacityResolution(resolution);
        return;
      }
      showErrorToast(error);
      throw error;
    }
  });

  return {
    open: () => {
      if (!latestRef.current.canInviteManager) return;
      setPeopleCapacityResolution(null);
      setIsOpen(true);
    },
    resend: (invitationId: string) => {
      const invitation = latestRef.current.invitations.find((candidate) => candidate.id === invitationId);
      if (!invitation?.canResend) return;
      void run({ kind: "resend", invitationId: invitationId as Id<"organizationInvitations"> }).catch(() => undefined);
    },
    revoke: (invitationId: string) => {
      const invitation = latestRef.current.invitations.find((candidate) => candidate.id === invitationId);
      if (!invitation?.canRevoke) return;
      void run({ kind: "revoke", invitationId: invitationId as Id<"organizationInvitations"> }).catch(() => undefined);
    },
    dialog: {
      isOpen,
      managerInvitationMode: input.managerInvitationMode,
      freeManagerExchangeCandidates: input.freeManagerExchangeCandidates,
      peopleCapacityResolution,
      isRunning,
      onClose: () => {
        setPeopleCapacityResolution(null);
        setIsOpen(false);
      },
      onSubmit: (email: string) => void run({ kind: "create", email }).catch(() => undefined),
    },
  };
}
