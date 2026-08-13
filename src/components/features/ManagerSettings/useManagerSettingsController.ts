import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { clearRequestedShopSearch } from "@/src/lib/authenticatedSearch";
import type {
  ManagerSettingsConfirmation,
  ManagerSettingsInvitation,
  ManagerSettingsManager,
  ReadyManagerSettingsOverview,
} from "./types";
import { canResendManagerInvitation } from "./types";

export function useManagerSettingsController({
  overview,
  shopId,
}: {
  overview: ReadyManagerSettingsOverview;
  shopId: string;
}) {
  const navigate = useNavigate();
  const resend = useShopMutation(api.organizationInvitation.mutations.resend);
  const revoke = useShopMutation(api.organizationInvitation.mutations.revoke);
  const removeManagerRole = useShopMutation(api.organization.mutations.removeManagerRole);
  const [confirmation, setConfirmation] = useState<ManagerSettingsConfirmation>(null);
  const latestOverviewRef = useRef(overview);
  latestOverviewRef.current = overview;

  useEffect(() => {
    setConfirmation((current) => (current && isConfirmationCurrent(current, overview) ? current : null));
  }, [overview]);

  const execute = useCallback(
    async (current: Exclude<ManagerSettingsConfirmation, null>) => {
      const latest = latestOverviewRef.current;
      if (!isConfirmationCurrent(current, latest)) {
        setConfirmation(null);
        return;
      }

      try {
        if (current.kind === "resend") {
          await resend({ invitationId: current.invitation.invitationId, requestId: current.requestId });
          showSuccessToast({ title: "再送を受け付けました" });
        } else if (current.kind === "revoke") {
          await revoke({ invitationId: current.invitation.invitationId, requestId: current.requestId });
          showSuccessToast({ title: "招待を取り消しました" });
        } else {
          await removeManagerRole({ personId: current.manager.personId, requestId: current.requestId });
          showSuccessToast({
            title: "管理者権限を外しました",
            description: "人物情報とスタッフとしての店舗所属は維持しています。",
          });
          if (current.manager.isSelf) {
            setConfirmation(null);
            void navigate({ to: "/dashboard", search: clearRequestedShopSearch(), replace: true });
            return;
          }
        }
        setConfirmation(null);
      } catch (error) {
        showErrorToast(error);
      }
    },
    [navigate, removeManagerRole, resend, revoke],
  );
  const { run, isRunning } = useSingleFlight(execute);

  return {
    confirmation,
    isRunning,
    onRequestResend: (invitation: ManagerSettingsInvitation) => {
      if (canResendManagerInvitation(invitation)) {
        setConfirmation({ kind: "resend", invitation, requestId: crypto.randomUUID() });
      }
    },
    onRequestRevoke: (invitation: ManagerSettingsInvitation) =>
      setConfirmation({ kind: "revoke", invitation, requestId: crypto.randomUUID() }),
    onRequestRemoveRole: (manager: ManagerSettingsManager) =>
      setConfirmation({ kind: "removeRole", manager, requestId: crypto.randomUUID() }),
    onCloseConfirmation: () => {
      if (!isRunning) setConfirmation(null);
    },
    onConfirm: () => {
      if (confirmation) void run(confirmation);
    },
    onBack: () => void navigate({ to: "/settings", search: { shop: shopId }, replace: true }),
  };
}

function isConfirmationCurrent(
  confirmation: Exclude<ManagerSettingsConfirmation, null>,
  overview: ReadyManagerSettingsOverview,
) {
  if (confirmation.kind === "removeRole") {
    const current = overview.managers.find((manager) => manager.personId === confirmation.manager.personId);
    return current?.canRemoveRole === true;
  }
  const current = overview.invitations.find(
    (invitation) => invitation.invitationId === confirmation.invitation.invitationId,
  );
  return confirmation.kind === "resend"
    ? current !== undefined && canResendManagerInvitation(current)
    : current?.canRevoke === true;
}
