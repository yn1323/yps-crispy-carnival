import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { UserDetailData } from "./types";

export function useUserLineActions({ data }: { data: UserDetailData }) {
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [qrTargetKey, setQrTargetKey] = useState<string | null>(null);
  const currentTargetRef = useRef(toLineActionTarget(data));
  currentTargetRef.current = toLineActionTarget(data);

  const generateLineLinkToken = useMutation(api.line.mutations.generateLinkToken);
  const sendLineInvite = useMutation(api.line.mutations.sendInvite);
  const disconnectOrganizationPersonLine = useMutation(api.line.mutations.disconnectOrganizationPersonLine);
  const lineSourceKey = toLineSourceKey(data);

  useEffect(() => {
    if (data.line.canLink && lineSourceKey && qrTargetKey === lineSourceKey) return;
    setAuthorizeUrl(null);
    setQrTargetKey(null);
  }, [data.line.canLink, lineSourceKey, qrTargetKey]);

  const { run: showQr, isRunning: isQrLoading } = useSingleFlight(async () => {
    const target = currentTargetRef.current;
    if (!target.canLink || !target.sourceShopId || !target.sourceStaffId) return false;
    setQrTargetKey(toLineTargetSourceKey(target));
    setAuthorizeUrl(null);
    try {
      const result = await generateLineLinkToken({ shopId: target.sourceShopId, staffId: target.sourceStaffId });
      if (isSameLineLinkTarget(currentTargetRef.current, target)) {
        setAuthorizeUrl(result.authorizeUrl);
        return true;
      }
    } catch (error) {
      if (isSameLineLinkTarget(currentTargetRef.current, target)) {
        setQrTargetKey(null);
        showErrorToast(error);
      }
    }
    return false;
  });

  const { run: sendInvite, isRunning: isSendingInvite } = useSingleFlight(async () => {
    const target = currentTargetRef.current;
    if (!target.canLink || !target.sourceShopId || !target.sourceStaffId) return false;
    try {
      await sendLineInvite({ shopId: target.sourceShopId, staffId: target.sourceStaffId });
      if (isSameLineLinkTarget(currentTargetRef.current, target)) {
        showSuccessToast({ title: "LINE連携リンクをメールで送りました" });
        return true;
      }
    } catch (error) {
      if (isSameLineLinkTarget(currentTargetRef.current, target)) showErrorToast(error);
    }
    return false;
  });

  const { run: disconnect, isRunning: isDisconnecting } = useSingleFlight(async (requestId: string) => {
    const target = currentTargetRef.current;
    if (!target.canDisconnect) return false;
    try {
      await disconnectOrganizationPersonLine({
        shopId: target.actionShopId,
        organizationPersonId: target.personId,
        requestId,
      });
      if (isSameLinePersonTarget(currentTargetRef.current, target)) {
        setAuthorizeUrl(null);
        setQrTargetKey(null);
        showSuccessToast({ title: "この組織のLINE連携を解除しました" });
        return true;
      }
    } catch (error) {
      if (isSameLinePersonTarget(currentTargetRef.current, target)) showErrorToast(error);
    }
    return false;
  });

  return {
    authorizeUrl,
    showQr: qrTargetKey !== null && qrTargetKey === lineSourceKey,
    isQrLoading,
    isSendingInvite,
    isDisconnecting,
    onShowQr: showQr,
    onSendInvite: sendInvite,
    onDisconnect: disconnect,
  };
}

function toLineActionTarget(data: UserDetailData) {
  return {
    personId: data.person.id,
    status: data.line.status,
    actionShopId: data.line.actionShopId,
    sourceShopId: data.line.sourceShopId,
    sourceStaffId: data.line.sourceStaffId,
    canLink: data.line.canLink,
    canDisconnect: data.line.canDisconnect,
  };
}

function isSameLineLinkTarget(
  current: ReturnType<typeof toLineActionTarget>,
  started: ReturnType<typeof toLineActionTarget>,
) {
  return (
    current.personId === started.personId &&
    current.actionShopId === started.actionShopId &&
    current.status === started.status &&
    current.sourceShopId === started.sourceShopId &&
    current.sourceStaffId === started.sourceStaffId &&
    current.canLink
  );
}

function isSameLinePersonTarget(
  current: ReturnType<typeof toLineActionTarget>,
  started: ReturnType<typeof toLineActionTarget>,
) {
  return current.personId === started.personId && current.actionShopId === started.actionShopId;
}

function toLineSourceKey(data: UserDetailData) {
  if (!data.line.sourceShopId || !data.line.sourceStaffId) return null;
  return `${data.person.id}:${data.line.status}:${data.line.sourceShopId}:${data.line.sourceStaffId}`;
}

function toLineTargetSourceKey(target: ReturnType<typeof toLineActionTarget>) {
  if (!target.sourceShopId || !target.sourceStaffId) return null;
  return `${target.personId}:${target.status}:${target.sourceShopId}:${target.sourceStaffId}`;
}
