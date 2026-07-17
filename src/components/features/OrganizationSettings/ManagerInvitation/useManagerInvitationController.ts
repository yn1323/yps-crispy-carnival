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

type Input = {
  canInviteManager: boolean;
  canOpenManagerInvitation: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
};

type Operation = { kind: "create"; name: string; email: string; personId?: Id<"organizationPeople"> };

export function useManagerInvitationController(input: Input) {
  const createInvitation = useShopMutation(api.organizationInvitation.mutations.createExternal);
  const createForPerson = useShopMutation(api.organizationInvitation.mutations.createForPerson);
  const [isOpen, setIsOpen] = useState(false);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;

  useEffect(() => {
    if (input.canOpenManagerInvitation) return;
    setIsOpen(false);
    setPeopleCapacityResolution(null);
  }, [input.canOpenManagerInvitation]);

  const { run, isRunning } = useSingleFlight(async (operation: Operation) => {
    const latest = latestRef.current;
    if (operation.kind === "create") {
      const isCurrentCandidate =
        latest.managerInvitationMode === "addition" ||
        latest.freeManagerExchangeCandidates.some((candidate) => candidate.email === operation.email);
      if (!latest.canOpenManagerInvitation || !isCurrentCandidate) {
        setIsOpen(false);
        setPeopleCapacityResolution(null);
        return;
      }
    }

    const requestId = crypto.randomUUID();
    if (operation.kind === "create") setPeopleCapacityResolution(null);

    try {
      if (operation.personId) {
        await createForPerson({ personId: operation.personId, requestId });
      } else {
        await createInvitation({ name: operation.name, email: operation.email, requestId });
      }
      showSuccessToast({
        title: "ログイン案内を送りました",
        description:
          latest.managerInvitationMode === "freeManagerExchange"
            ? "本人のアカウント連携が完了するまでは、現在の管理者が操作を継続します。"
            : "本人がログインしてアカウントを連携すると、管理者になります。",
      });
      setIsOpen(false);
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
      if (!latestRef.current.canOpenManagerInvitation) return;
      setPeopleCapacityResolution(null);
      setIsOpen(true);
    },
    dialog: {
      isOpen,
      isResendOnly: !input.canInviteManager && input.canOpenManagerInvitation,
      managerInvitationMode: input.managerInvitationMode,
      freeManagerExchangeCandidates: input.freeManagerExchangeCandidates,
      peopleCapacityResolution,
      isRunning,
      onClose: () => {
        setPeopleCapacityResolution(null);
        setIsOpen(false);
      },
      onSubmit: (input: { name: string; email: string; personId?: string }) =>
        void run({
          kind: "create",
          name: input.name,
          email: input.email,
          ...(input.personId ? { personId: input.personId as Id<"organizationPeople"> } : {}),
        }).catch(() => undefined),
    },
  };
}
