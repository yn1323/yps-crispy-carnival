import { useCallback, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { Staff } from "../types";

type Options = {
  isReadOnly?: boolean;
};

type LatestContext = {
  selectedStaff: Staff | null;
  isReadOnly: boolean;
};

export function useStaffManagerInvitation(selectedStaff: Staff | null, { isReadOnly = false }: Options = {}) {
  const createForStaff = useShopMutation(api.organizationInvitation.mutations.createForStaff);
  const latestContextRef = useRef<LatestContext>({ selectedStaff, isReadOnly });
  latestContextRef.current = { selectedStaff, isReadOnly };

  const { run, isRunning } = useSingleFlight(async (target: Staff): Promise<boolean> => {
    const latest = latestContextRef.current;
    const currentTarget = latest.selectedStaff;
    if (
      latest.isReadOnly ||
      !currentTarget ||
      currentTarget._id !== target._id ||
      currentTarget.managerInvitationState.kind !== "available"
    ) {
      return false;
    }

    const invitationMode = currentTarget.managerInvitationState.mode;
    try {
      const result = await createForStaff({
        staffId: currentTarget._id,
        requestId: crypto.randomUUID(),
      });
      if (result.status !== "created" && result.status !== "alreadyPending") return false;

      showSuccessToast({
        title: invitationMode === "freeManagerExchange" ? "管理者交代の招待を送りました" : "管理者招待を送りました",
      });
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    }
  });

  const handleInvite = useCallback(async (target: Staff): Promise<boolean> => (await run(target)) === true, [run]);

  return {
    onInvite: handleInvite,
    isInviting: isRunning,
  };
}
