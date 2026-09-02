import { useMutation } from "convex/react";
import { useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { UserMembershipChangeInput } from "./types";

export function useUserMembershipActions({
  canChangeMembership,
  expectedOrganizationId,
}: {
  canChangeMembership: boolean;
  expectedOrganizationId: Id<"organizations">;
}) {
  const canChangeMembershipRef = useRef(canChangeMembership);
  canChangeMembershipRef.current = canChangeMembership;
  const changeOrganizationPersonShopMemberships = useMutation(
    api.staff.mutations.changeOrganizationPersonShopMemberships,
  );

  const { run: changeMemberships, isRunning: isChangingMemberships } = useSingleFlight(
    async (personId: Id<"organizationPeople">, input: UserMembershipChangeInput) => {
      if (!canChangeMembershipRef.current) return false;
      try {
        await changeOrganizationPersonShopMemberships({
          ...input,
          personId,
          expectedOrganizationId,
        });
        if (!canChangeMembershipRef.current) return false;
        showSuccessToast({ title: "所属店舗を変更しました" });
        return true;
      } catch (error) {
        if (canChangeMembershipRef.current) {
          const message = getConvexErrorMessage(error);
          showErrorToast(isMembershipChangeStaleError(message) ? new Error(STALE_RELOAD_MESSAGE) : error);
        }
        return false;
      }
    },
  );

  return {
    isChangingMemberships,
    onChangeMemberships: changeMemberships,
  };
}

const STALE_RELOAD_MESSAGE =
  "所属店舗または今日以降のシフトの状態が変更されました。\n画面を再読み込みして、もう一度お試しください。";

function isMembershipChangeStaleError(message: string | undefined) {
  return (
    message?.includes("店舗所属が変更されています") ||
    message?.includes("削除対象のシフトが変更されています") ||
    message?.includes("今日以降のシフトの割り当てが変更されました")
  );
}
