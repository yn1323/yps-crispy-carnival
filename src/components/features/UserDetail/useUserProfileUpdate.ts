import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserDetailData } from "./types";

export function useUserProfileUpdate({
  data,
  selectedShopId,
  expectedOrganizationId,
}: {
  data: UserDetailData;
  selectedShopId: string | null;
  expectedOrganizationId?: Id<"organizations">;
}) {
  const updatePersonProfile = useMutation(api.organization.mutations.updatePersonProfile);
  const { run, isRunning } = useSingleFlight(async (formData: PersonProfileFormData): Promise<boolean> => {
    if (!data.canWrite || !selectedShopId) return false;

    try {
      await updatePersonProfile({
        shopId: selectedShopId as Id<"shops">,
        personId: data.person.id,
        name: formData.name,
        email: formData.email,
        requestId: crypto.randomUUID(),
        ...(expectedOrganizationId ? { expectedOrganizationId } : {}),
      });
      showSuccessToast({ title: "ユーザー情報を更新しました" });
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    }
  });

  return { update: run, isUpdating: isRunning };
}
