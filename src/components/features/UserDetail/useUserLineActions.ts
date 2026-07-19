import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserDetailMembership } from "./types";

export function useUserLineActions({
  membership,
  isReadOnly,
}: {
  membership: UserDetailMembership | null;
  isReadOnly: boolean;
}) {
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [qrTargetStaffId, setQrTargetStaffId] = useState<string | null>(null);
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;
  const generateLineLinkToken = useShopMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useShopMutation(api.line.mutations.sendInvite);

  useEffect(() => {
    if (!isReadOnly && qrTargetStaffId === (membership?.staffId ?? null)) return;
    setAuthorizeUrl(null);
    setQrTargetStaffId(null);
  }, [isReadOnly, membership?.staffId, qrTargetStaffId]);

  const { run: showQr, isRunning: isQrLoading } = useSingleFlight(async () => {
    if (isReadOnlyRef.current || !membership) return;
    setQrTargetStaffId(membership.staffId);
    setAuthorizeUrl(null);
    try {
      const result = await generateLineLinkToken({ staffId: membership.staffId });
      if (!isReadOnlyRef.current) setAuthorizeUrl(result.authorizeUrl);
    } catch (error) {
      if (!isReadOnlyRef.current) {
        setQrTargetStaffId(null);
        showErrorToast(error);
      }
    }
  });

  const { run: sendInvite, isRunning: isSendingInvite } = useSingleFlight(async () => {
    if (isReadOnlyRef.current || !membership) return;
    try {
      await sendLineInvite({ staffId: membership.staffId });
      showSuccessToast({ title: "LINE連携リンクをメールで送りました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return {
    authorizeUrl,
    showQr: qrTargetStaffId === membership?.staffId,
    isQrLoading,
    isSendingInvite,
    onShowQr: showQr,
    onSendInvite: sendInvite,
  };
}
