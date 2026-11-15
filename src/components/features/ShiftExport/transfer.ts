import { z } from "zod";
import {
  POSITION_NAME_MAX_LENGTH,
  SHIFT_ASSIGNMENT_BREAK_LIMIT,
  SHIFT_BOARD_DATE_NOTE_LIMIT,
  SHIFT_DATE_NOTE_MAX_LENGTH,
} from "@/convex/constants";
import { shiftSubmissionPatternSchema } from "@/convex/shop/schemas";
import { buildExportSchedule } from "./script";
import type { ShiftExportData } from "./types";

export const TRANSFER_TIMEOUT_MS = 30_000;
export const SNAPSHOT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "shift-export-snapshot";
const idSchema = z.string().min(1).max(200);
// 既存の読み手はポジションを50件の窓で読む。
const POSITION_READ_WINDOW = 50;
// 隣り合う勤務をまとめた結果、1件の勤務が複数の勤務の休憩を持つことがある。
const SHIFT_ASSIGNMENT_BREAK_MERGE_FACTOR = 8;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dataSchema = z.object({
  shopName: z.string().min(1).max(200),
  recruitment: z.object({
    periodStart: dateSchema,
    periodEnd: dateSchema,
    shopClosedDates: z.array(dateSchema).max(31),
    submissionPattern: shiftSubmissionPatternSchema,
  }),
  staffs: z
    .array(z.object({ id: idSchema, name: z.string().max(200), isRemoved: z.boolean() }))
    .min(1)
    .max(200),
  assignments: z
    .array(
      z.object({
        staffId: idSchema,
        date: dateSchema,
        startTime: z.string().max(5),
        endTime: z.string().max(5),
        optionId: idSchema.nullable(),
        // デプロイ前に保存した一時データにはないため、省略を許す。
        positionId: idSchema.nullable().optional(),
        breaks: z
          .array(z.object({ startTime: z.string().max(5), endTime: z.string().max(5) }))
          .max(SHIFT_ASSIGNMENT_BREAK_LIMIT * SHIFT_ASSIGNMENT_BREAK_MERGE_FACTOR)
          .optional(),
      }),
    )
    .max(2000),
  positions: z
    .array(z.object({ id: idSchema, name: z.string().min(1).max(POSITION_NAME_MAX_LENGTH) }))
    .max(POSITION_READ_WINDOW)
    .default([]),
  includeDetailsByDefault: z.boolean().default(false),
  // デプロイ前に保存した一時データにはないため、空の一覧として読む。
  dateNotes: z
    .array(
      z.object({
        staffId: idSchema,
        date: dateSchema,
        note: z.string().min(1).max(SHIFT_DATE_NOTE_MAX_LENGTH),
      }),
    )
    .max(SHIFT_BOARD_DATE_NOTE_LIMIT)
    .default([]),
});
export const snapshotSchema = z.object({
  version: z.literal(1),
  transferId: z.uuid(),
  userId: idSchema,
  organizationId: idSchema,
  shopId: idSchema,
  recruitmentId: idSchema,
  createdAt: z.number().finite(),
  data: dataSchema,
});
export type ExportSnapshot = z.infer<typeof snapshotSchema>;
export type ExportScope = Pick<ExportSnapshot, "userId" | "organizationId" | "shopId" | "recruitmentId">;
export const scopeKey = (scope: ExportScope) =>
  JSON.stringify([scope.userId, scope.organizationId, scope.shopId, scope.recruitmentId]);
export const channelName = (id: string) => `shift-export:${id}`;

export function validateSnapshot(value: unknown, scope: ExportScope): ExportSnapshot {
  const snapshot = snapshotSchema.parse(value);
  if (
    scopeKey(snapshot) !== scopeKey(scope) ||
    snapshot.createdAt > Date.now() ||
    Date.now() - snapshot.createdAt >= SNAPSHOT_LIFETIME_MS
  ) {
    throw new Error("出力データの有効期限が切れたか、対象が変わりました。");
  }
  buildExportSchedule(snapshot.data);
  return snapshot;
}

export function createSnapshot(data: ShiftExportData, scope: ExportScope): ExportSnapshot {
  return validateSnapshot(
    { ...scope, version: 1, transferId: crypto.randomUUID(), createdAt: Date.now(), data },
    scope,
  );
}

export function clearStoredSnapshot() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 保存を禁止するブラウザでもメモリ内の帳票は破棄する。 */
  }
}
export function storeSnapshot(snapshot: ExportSnapshot): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
export function readStoredSnapshot(scope: ExportScope): ExportSnapshot | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > 2_000_000) throw new Error("oversized snapshot");
    return validateSnapshot(JSON.parse(raw), scope);
  } catch {
    clearStoredSnapshot();
    return null;
  }
}

/** noopenerを保ったまま受け渡す。受領までのready再送には同じ内容を返す。 */
export function sendSnapshot(snapshot: ExportSnapshot, onFailure: () => void, onFinish: () => void): () => void {
  const channel = new BroadcastChannel(channelName(snapshot.transferId));
  let sent = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    channel.close();
    onFinish();
  };
  const timer = setTimeout(() => {
    close();
    onFailure();
  }, TRANSFER_TIMEOUT_MS);
  channel.onmessage = ({ data }: MessageEvent<unknown>) => {
    const message = z
      .object({ type: z.enum(["ready", "received"]), transferId: z.uuid(), userId: idSchema })
      .safeParse(data);
    if (!message.success || message.data.transferId !== snapshot.transferId || message.data.userId !== snapshot.userId)
      return;
    if (message.data.type === "ready") {
      sent = true;
      channel.postMessage({ type: "snapshot", snapshot });
    } else if (message.data.type === "received" && sent) close();
  };
  const search = new URLSearchParams({ org: snapshot.organizationId });
  try {
    window.open(
      `/shifts/${encodeURIComponent(snapshot.recruitmentId)}/export?${search}#${snapshot.transferId}`,
      "_blank",
      "noopener,noreferrer",
    );
  } catch {
    close();
    onFailure();
  }
  return close;
}
