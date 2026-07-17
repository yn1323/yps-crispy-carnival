import { useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { OrganizationPersonView } from "../types";

export function usePersonManagerAssignmentController(people: OrganizationPersonView[]) {
  const createForPerson = useShopMutation(api.organizationInvitation.mutations.createForPerson);
  const latestPeopleRef = useRef(people);
  latestPeopleRef.current = people;

  const { run, isRunning } = useSingleFlight(async (personId: string): Promise<boolean> => {
    const person = latestPeopleRef.current.find((candidate) => candidate.id === personId);
    if (person?.managerRole !== "none") return false;

    try {
      await createForPerson({
        personId: personId as Id<"organizationPeople">,
        requestId: crypto.randomUUID(),
      });
      showSuccessToast({
        title: "ログイン案内を送りました",
        description: "本人のアカウントと店舗人物の連携後に管理者になります。",
      });
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    }
  });

  return { assign: run, isRunning };
}
