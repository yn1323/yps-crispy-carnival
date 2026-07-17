import { useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { OrganizationPersonView } from "../types";

export function usePersonProfileController(people: OrganizationPersonView[]) {
  const updatePersonProfile = useShopMutation(api.organization.mutations.updatePersonProfile);
  const latestPeopleRef = useRef(people);
  latestPeopleRef.current = people;

  const { run, isRunning } = useSingleFlight(
    async (personId: string, data: PersonProfileFormData): Promise<boolean> => {
      const person = latestPeopleRef.current.find((candidate) => candidate.id === personId);
      if (!person) return false;

      try {
        await updatePersonProfile({
          personId: personId as Id<"organizationPeople">,
          name: data.name,
          email: data.email,
          requestId: crypto.randomUUID(),
        });
        showSuccessToast({ title: "ユーザー情報を更新しました" });
        return true;
      } catch (error) {
        showErrorToast(error);
        return false;
      }
    },
  );

  return {
    update: run,
    isRunning,
  };
}
