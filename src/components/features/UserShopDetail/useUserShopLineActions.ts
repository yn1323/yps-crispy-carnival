import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserShopDetailMembership } from "./types";

export function useUserShopLineActions({
  targetShopId,
  membership,
  isReadOnly,
}: {
  targetShopId: Id<"shops">;
  membership: UserShopDetailMembership;
  isReadOnly: boolean;
}) {
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [qrTargetStaffId, setQrTargetStaffId] = useState<Id<"staffs"> | null>(null);
  const currentTargetRef = useRef({ targetShopId, staffId: membership.staffId, isReadOnly });
  currentTargetRef.current = { targetShopId, staffId: membership.staffId, isReadOnly };
  const generateLineLinkToken = useMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useMutation(api.line.mutations.sendInvite);

  useEffect(() => {
    if (!isReadOnly && qrTargetStaffId === membership.staffId) return;
    setAuthorizeUrl(null);
    setQrTargetStaffId(null);
  }, [isReadOnly, membership.staffId, qrTargetStaffId]);

  const { run: showQr, isRunning: isQrLoading } = useSingleFlight(async () => {
    const target = currentTargetRef.current;
    if (target.isReadOnly || membership.shopId !== target.targetShopId || membership.staffId !== target.staffId) return;
    setQrTargetStaffId(target.staffId);
    setAuthorizeUrl(null);
    try {
      const result = await generateLineLinkToken({ shopId: target.targetShopId, staffId: target.staffId });
      const current = currentTargetRef.current;
      if (!current.isReadOnly && current.targetShopId === target.targetShopId && current.staffId === target.staffId) {
        setAuthorizeUrl(result.authorizeUrl);
      }
    } catch (error) {
      const current = currentTargetRef.current;
      if (!current.isReadOnly && current.targetShopId === target.targetShopId && current.staffId === target.staffId) {
        setQrTargetStaffId(null);
        showErrorToast(error);
      }
    }
  });

  const { run: sendInvite, isRunning: isSendingInvite } = useSingleFlight(async () => {
    const target = currentTargetRef.current;
    if (target.isReadOnly || membership.shopId !== target.targetShopId || membership.staffId !== target.staffId) return;
    try {
      await sendLineInvite({ shopId: target.targetShopId, staffId: target.staffId });
      const current = currentTargetRef.current;
      if (!current.isReadOnly && current.targetShopId === target.targetShopId && current.staffId === target.staffId) {
        showSuccessToast({ title: "LINE連携リンクをメールで送りました" });
      }
    } catch (error) {
      const current = currentTargetRef.current;
      if (current.targetShopId === target.targetShopId && current.staffId === target.staffId) showErrorToast(error);
    }
  });

  return {
    authorizeUrl,
    showQr: qrTargetStaffId === membership.staffId,
    isQrLoading,
    isSendingInvite,
    onShowQr: showQr,
    onSendInvite: sendInvite,
  };
}
