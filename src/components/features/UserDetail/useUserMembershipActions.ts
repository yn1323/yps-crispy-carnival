import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";

export function useUserMembershipActions({ canAddMembership }: { canAddMembership: boolean }) {
  const canAddMembershipRef = useRef(canAddMembership);
  canAddMembershipRef.current = canAddMembership;
  const [addingShopId, setAddingShopId] = useState<Id<"shops"> | null>(null);
  const addOrganizationPersonToShop = useMutation(api.staff.mutations.addOrganizationPersonToShop);

  const { run: addMembership, isRunning: isAddingMembership } = useSingleFlight(
    async (personId: Id<"organizationPeople">, shopId: Id<"shops">) => {
      if (!canAddMembershipRef.current) return false;
      setAddingShopId(shopId);
      try {
        await addOrganizationPersonToShop({ shopId, personId, requestId: crypto.randomUUID() });
        if (!canAddMembershipRef.current) return false;
        showSuccessToast({ title: "店舗にユーザーを追加しました" });
        return true;
      } catch (error) {
        if (canAddMembershipRef.current) showErrorToast(error);
        return false;
      } finally {
        setAddingShopId(null);
      }
    },
  );

  return {
    isAddingMembership,
    addingShopId,
    onAddMembership: addMembership,
  };
}
