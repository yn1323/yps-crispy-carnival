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
import type { OrganizationPersonView } from "../types";
import type { ManagerInvitationStaffCandidate, ManagerInvitationSubmitInput } from "./types";

type Input = {
  canInviteManager: boolean;
  canOpenManagerInvitation: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  people: OrganizationPersonView[];
};

type Operation =
  | { kind: "external"; name: string; email: string }
  | { kind: "person"; personId: Id<"organizationPeople"> };

function getStaffCandidates(input: Input): ManagerInvitationStaffCandidate[] {
  const freeCandidateIds = new Set(input.freeManagerExchangeCandidates.map((candidate) => candidate.id));
  return input.people.flatMap((person) => {
    if (
      !person.isStaff ||
      person.managerRole !== "none" ||
      !person.email ||
      (!input.canInviteManager && !person.hasManagerInvitation) ||
      (input.managerInvitationMode === "freeManagerExchange" && !freeCandidateIds.has(person.id))
    ) {
      return [];
    }
    return [
      {
        id: person.id,
        name: person.name,
        email: person.email,
        shopNames: person.shopNames,
        isResend: person.hasManagerInvitation === true,
      },
    ];
  });
}

export function useManagerInvitationController(input: Input) {
  const createInvitation = useShopMutation(api.organizationInvitation.mutations.createExternal);
  const createForPerson = useShopMutation(api.organizationInvitation.mutations.createForPerson);
  const [isOpen, setIsOpen] = useState(false);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;
  const staffCandidates = getStaffCandidates(input);
  const isResendOnly = !input.canInviteManager && input.canOpenManagerInvitation;

  useEffect(() => {
    if (input.canOpenManagerInvitation) return;
    setIsOpen(false);
    setPeopleCapacityResolution(null);
  }, [input.canOpenManagerInvitation]);

  const { run, isRunning } = useSingleFlight(async (operation: Operation) => {
    const latest = latestRef.current;
    const isCurrentOperation =
      latest.canOpenManagerInvitation &&
      (operation.kind === "external"
        ? latest.managerInvitationMode === "addition"
        : getStaffCandidates(latest).some((candidate) => candidate.id === operation.personId));
    if (!isCurrentOperation) {
      setIsOpen(false);
      setPeopleCapacityResolution(null);
      return;
    }

    const requestId = crypto.randomUUID();
    setPeopleCapacityResolution(null);

    try {
      if (operation.kind === "person") {
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
      if (resolution) {
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
      isResendOnly,
      defaultTab:
        isResendOnly && input.managerInvitationMode === "addition" && staffCandidates.length === 0
          ? ("external" as const)
          : ("staff" as const),
      managerInvitationMode: input.managerInvitationMode,
      staffCandidates,
      peopleCapacityResolution,
      isRunning,
      onClose: () => {
        setPeopleCapacityResolution(null);
        setIsOpen(false);
      },
      onSubmit: (submitInput: ManagerInvitationSubmitInput) =>
        void run(
          submitInput.kind === "person"
            ? { kind: "person", personId: submitInput.personId as Id<"organizationPeople"> }
            : { kind: "external", name: submitInput.name, email: submitInput.email },
        ).catch(() => undefined),
    },
  };
}
