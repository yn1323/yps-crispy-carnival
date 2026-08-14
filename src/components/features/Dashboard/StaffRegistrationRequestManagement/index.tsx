import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import {
  classifyPeopleCapacityError,
  type PeopleCapacityResolution,
} from "@/src/domains/organizationBilling/peopleCapacity";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import { resolveStaffRegistrationApprovalAvailability } from "../StaffRegistrationRequests";
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
  isReadOnly?: boolean;
  onOpenBillingSettings?: () => void;
  children: (state: StaffRegistrationRequestManagementState) => ReactNode;
};

export function StaffRegistrationRequestManagement({
  requests: requestOverrides,
  isReadOnly = false,
  onOpenBillingSettings,
  children,
}: Props) {
  const dialog = useDialog();
  const [rejectTarget, setRejectTarget] = useState<StaffRegistrationRequest | null>(null);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const queriedRequests = useShopQuery(
    api.staffRegistration.queries.getPendingRequests,
    requestOverrides ? "skip" : {},
  );
  const requests = requestOverrides ?? queriedRequests ?? [];
  const approveRequest = useShopMutation(api.staffRegistration.mutations.approveRequest);
  const rejectRequest = useShopMutation(api.staffRegistration.mutations.rejectRequest);

  const handleDialogOpenChange = (details: { open: boolean }) => {
    if (details.open && isReadOnly) return;
    if (!details.open) setPeopleCapacityResolution(null);
    dialog.onOpenChange(details);
  };

  useEffect(() => {
    if (isReadOnly || (dialog.isOpen && requests.length === 0)) {
      setPeopleCapacityResolution(null);
      setRejectTarget(null);
      dialog.close();
    }
  }, [dialog.close, dialog.isOpen, isReadOnly, requests.length]);

  const { run: handleApprove, isRunning: isApproving } = useSingleFlight(async (request: StaffRegistrationRequest) => {
    if (isReadOnly || !resolveStaffRegistrationApprovalAvailability(request).canApprove) return;
    setPeopleCapacityResolution(null);
    try {
      await approveRequest({ requestId: request._id });
      showSuccessToast({
        title: "スタッフ登録申請を承認し、案内通知を送りました",
        description: "LINE連携案内をメールで送りました。\n募集中のシフトがある場合は、提出リンクもメールで送ります。",
      });
    } catch (error) {
      const resolution = classifyPeopleCapacityError(getConvexErrorMessage(error));
      if (resolution) {
        setPeopleCapacityResolution(resolution);
        return;
      }
      showErrorToast(error);
    }
  });

  const { run: handleReject, isRunning: isRejecting } = useSingleFlight(async () => {
    if (isReadOnly || !rejectTarget) return;
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
      isReadOnly={isReadOnly}
      onOpenChange={handleDialogOpenChange}
      onClose={() => {
        setPeopleCapacityResolution(null);
        dialog.close();
      }}
      requests={requests}
      peopleCapacityResolution={peopleCapacityResolution}
      onOpenBillingSettings={onOpenBillingSettings}
      rejectTarget={rejectTarget}
      onApprove={handleApprove}
      onRejectClick={(request) => {
        if (isReadOnly) return;
        setPeopleCapacityResolution(null);
        setRejectTarget(request);
      }}
      onRejectClose={() => setRejectTarget(null)}
      onRejectConfirm={handleReject}
      isApproving={isApproving}
      isRejecting={isRejecting}
    />
  );

  return children({
    isInitialLoading: requestOverrides === undefined && queriedRequests === undefined,
    requests,
    openStaffRegistrationRequests: () => {
      if (isReadOnly) return;
      setPeopleCapacityResolution(null);
      dialog.open();
    },
    content,
  });
}
