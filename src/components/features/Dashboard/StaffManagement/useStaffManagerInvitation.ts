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
      (currentTarget.managerInvitationState.kind !== "available" &&
        currentTarget.managerInvitationState.kind !== "pending")
    ) {
      return false;
    }

    const invitationMode = currentTarget.managerInvitationState.mode;
    const isResend = currentTarget.managerInvitationState.kind === "pending";
    try {
      const result = await createForStaff({
        staffId: currentTarget._id,
        requestId: crypto.randomUUID(),
      });
      if (result.status !== "created" && result.status !== "alreadyPending") return false;
      const didResend = isResend || result.status === "alreadyPending";

      showSuccessToast({
        title: didResend
          ? "ログイン案内を再送しました"
          : invitationMode === "freeManagerExchange"
            ? "次の管理者として招待しました"
            : "ログイン案内を送りました",
        description: didResend
          ? "以前のURLは利用できません。"
          : invitationMode === "freeManagerExchange"
            ? "本人がログインして招待を受け入れると、自動で管理者が交代します。"
            : "本人が案内先のメールアドレスでログインし、招待を受け入れると管理者になります。",
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
