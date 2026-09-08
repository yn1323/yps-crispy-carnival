import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toaster } from "@/src/components/ui/toaster";
import {
  channelName,
  clearStoredSnapshot,
  createSnapshot,
  type ExportScope,
  type ExportSnapshot,
  readStoredSnapshot,
  SNAPSHOT_LIFETIME_MS,
  scopeKey,
  sendSnapshot,
  storeSnapshot,
  TRANSFER_TIMEOUT_MS,
  validateSnapshot,
} from "./transfer";
import type { ShiftExportData } from "./types";

type RouteScope = Omit<ExportScope, "userId" | "shopId"> & { shopId?: string };
const RECEIVE_ERROR = "シフト表から出力画面を開き直してください。";

export function useOpenShiftExport(scope: RouteScope & { shopName?: string }) {
  const { userId } = useAuth();
  const pending = useRef(new Set<() => void>());
  const { organizationId, shopId, recruitmentId, shopName } = scope;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 利用者・対象の切替時に未受領データを破棄する。
  useEffect(() => {
    const transfers = pending.current;
    return () => {
      for (const cancel of transfers) cancel();
      transfers.clear();
    };
  }, [userId, organizationId, shopId, recruitmentId]);
  return useCallback(
    (data: Omit<ShiftExportData, "shopName">) => {
      if (!userId || !shopId || !shopName) return;
      try {
        const snapshot = createSnapshot({ ...data, shopName }, { userId, organizationId, shopId, recruitmentId });
        let finished = false;
        let cancel: (() => void) | undefined;
        cancel = sendSnapshot(
          snapshot,
          () =>
            toaster.create({
              title: "出力画面を開けませんでした",
              description: "ポップアップの設定を確認し、もう一度出力してください。",
              type: "error",
            }),
          () => {
            finished = true;
            if (cancel) pending.current.delete(cancel);
          },
        );
        if (!finished) pending.current.add(cancel);
      } catch {
        toaster.create({
          title: "シフト表を出力できません",
          description: "勤務内容と出力対象のスタッフを確認してください。",
          type: "error",
        });
      }
    },
    [userId, organizationId, shopId, recruitmentId, shopName],
  );
}

type ReceivedState = { key: string; snapshot: ExportSnapshot | null; error: string | null; storageAvailable: boolean };
export function useReceivedShiftExport(scope: RouteScope, authorized: boolean | undefined) {
  const { userId } = useAuth();
  const { organizationId, shopId, recruitmentId } = scope;
  const key = JSON.stringify([userId, organizationId, shopId, recruitmentId]);
  const [state, setState] = useState<ReceivedState | null>(null);
  const cached = useRef<ExportSnapshot | null>(null);
  // StrictModeのeffect再接続でも、URLから取り除いた受け渡しIDを維持する。
  const [transferId] = useState(() => z.uuid().safeParse(window.location.hash.slice(1)));
  useEffect(() => {
    if (!userId || authorized === false) {
      cached.current = null;
      clearStoredSnapshot();
      setState(null);
      return;
    }
    if (!shopId || authorized !== true) return;
    const verifiedScope: ExportScope = { userId, organizationId, shopId, recruitmentId };
    let alive = true;
    let completed = false;
    let channel: BroadcastChannel | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      cached.current = null;
      clearStoredSnapshot();
      setState({ key, snapshot: null, error: RECEIVE_ERROR, storageAvailable: true });
    };
    const accept = (value: unknown) => {
      const snapshot = validateSnapshot(value, verifiedScope);
      completed = true;
      cached.current = snapshot;
      setState({ key, snapshot, error: null, storageAvailable: storeSnapshot(snapshot) });
      expiry = setTimeout(fail, Math.max(0, snapshot.createdAt + SNAPSHOT_LIFETIME_MS - Date.now()));
    };
    const saved =
      cached.current && scopeKey(cached.current) === scopeKey(verifiedScope)
        ? cached.current
        : readStoredSnapshot(verifiedScope);
    try {
      if (saved && (!transferId.success || saved.transferId === transferId.data)) {
        accept(saved);
      } else if (transferId.success) {
        clearStoredSnapshot();
        setState({ key, snapshot: null, error: null, storageAvailable: true });
        channel = new BroadcastChannel(channelName(transferId.data));
        timeout = setTimeout(() => {
          channel?.close();
          if (alive) fail();
        }, TRANSFER_TIMEOUT_MS);
        channel.onmessage = ({ data }: MessageEvent<unknown>) => {
          if (!alive || completed) return;
          const message = z.object({ type: z.literal("snapshot"), snapshot: z.unknown() }).safeParse(data);
          if (!message.success) return;
          try {
            const snapshot = validateSnapshot(message.data.snapshot, verifiedScope);
            if (snapshot.transferId !== transferId.data) return;
            accept(snapshot);
            window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
            channel?.postMessage({ type: "received", userId, transferId: transferId.data });
            clearTimeout(timeout);
            channel?.close();
          } catch {
            clearTimeout(timeout);
            channel?.close();
            fail();
          }
        };
        channel.postMessage({ type: "ready", userId, transferId: transferId.data });
      } else fail();
    } catch {
      fail();
    }
    return () => {
      alive = false;
      channel?.close();
      clearTimeout(timeout);
      clearTimeout(expiry);
      clearStoredSnapshot();
    };
  }, [key, userId, organizationId, shopId, recruitmentId, authorized, transferId]);
  return authorized === true && state?.key === key ? state : null;
}
