import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { Staff } from "../types";

export function useStaffLineConnection() {
  const [qrTargetId, setQrTargetId] = useState<Staff["_id"] | null>(null);
  const [qrAuthorizeUrl, setQrAuthorizeUrl] = useState<string | null>(null);
  const [isQrLoading, setIsQrLoading] = useState(false);
  const generateLineLinkToken = useShopMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useShopMutation(api.line.mutations.sendInvite);

  const reset = useCallback(() => {
    setQrTargetId(null);
    setQrAuthorizeUrl(null);
    setIsQrLoading(false);
  }, []);

  const { run: handleShowQr } = useSingleFlight(async (staff: Staff) => {
    setQrTargetId(staff._id);
    setQrAuthorizeUrl(null);
    setIsQrLoading(true);
    try {
      const result = await generateLineLinkToken({ staffId: staff._id });
      setQrAuthorizeUrl(result.authorizeUrl);
    } catch (error) {
      showErrorToast(error);
      setQrTargetId(null);
    } finally {
      setIsQrLoading(false);
    }
  });

  const { run: handleSendInvite, isRunning: isSendingInvite } = useSingleFlight(async (staff: Staff) => {
    try {
      await sendLineInvite({ staffId: staff._id });
      showSuccessToast({ title: "LINE連携リンクをメールで送りました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return {
    reset,
    qrState: {
      staffId: qrTargetId,
      authorizeUrl: qrAuthorizeUrl,
      isLoading: isQrLoading,
    },
    onShowQr: handleShowQr,
    onSendInvite: handleSendInvite,
    isSendingInvite,
  };
}
