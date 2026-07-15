import { useQuery } from "convex/react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { StaffRegistrationRequest } from "../types";
import { StaffRegistrationRequestManagementView } from "./StaffRegistrationRequestManagementView";

export type StaffRegistrationRequestManagementState = {
  isInitialLoading: boolean;
  requests: StaffRegistrationRequest[];
  openStaffRegistrationRequests: () => void;
  content: ReactNode;
};

type Props = {
  requests?: StaffRegistrationRequest[];
  children: (state: StaffRegistrationRequestManagementState) => ReactNode;
};

export function StaffRegistrationRequestManagement({ requests: requestOverrides, children }: Props) {
  const dialog = useDialog();
  const [rejectTarget, setRejectTarget] = useState<StaffRegistrationRequest | null>(null);
  const queriedRequests = useQuery(api.staffRegistration.queries.getPendingRequests, requestOverrides ? "skip" : {});
  const requests = requestOverrides ?? queriedRequests ?? [];
  const approveRequest = useShopMutation(api.staffRegistration.mutations.approveRequest);
  const rejectRequest = useShopMutation(api.staffRegistration.mutations.rejectRequest);

  useEffect(() => {
    if (dialog.isOpen && requests.length === 0) dialog.close();
  }, [dialog.close, dialog.isOpen, requests.length]);

  const { run: handleApprove, isRunning: isApproving } = useSingleFlight(async (request: StaffRegistrationRequest) => {
    try {
      await approveRequest({ requestId: request._id });
      showSuccessToast({
        title: "スタッフ登録申請を承認し、案内通知を送りました",
        description: "LINE連携案内をメールで送りました。募集中シフトがある場合は提出リンクも届きます。",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: handleReject, isRunning: isRejecting } = useSingleFlight(async () => {
    if (!rejectTarget) return;
    try {
      await rejectRequest({ requestId: rejectTarget._id });
      setRejectTarget(null);
      showSuccessToast({ title: "スタッフ登録申請を却下しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const content = (
    <StaffRegistrationRequestManagementView
      isOpen={dialog.isOpen}
      onOpenChange={dialog.onOpenChange}
      onClose={dialog.close}
      requests={requests}
      rejectTarget={rejectTarget}
      onApprove={handleApprove}
      onRejectClick={setRejectTarget}
      onRejectClose={() => setRejectTarget(null)}
      onRejectConfirm={handleReject}
      isApproving={isApproving}
      isRejecting={isRejecting}
    />
  );

  return children({
    isInitialLoading: requestOverrides === undefined && queriedRequests === undefined,
    requests,
    openStaffRegistrationRequests: dialog.open,
    content,
  });
}
