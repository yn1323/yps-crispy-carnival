import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { NOTIFICATION_FANOUT_CANCELLATION_BATCH_SIZE, NOTIFICATION_FANOUT_SCOPE_LIMIT } from "../constants";

export const notificationFanoutKindValidator = v.union(v.literal("recruitment"), v.literal("confirmation"));

export const notificationFanoutPurposeValidator = v.union(
  v.literal("recruitment"),
  v.literal("confirmation"),
  v.literal("confirmation_resend"),
);

export const notificationFanoutStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const notificationFanoutCancelReasonValidator = v.union(
  v.literal("recruitment_inactive"),
  v.literal("superseded"),
);

type EnsureNotificationFanoutOperationArgs = {
  operationKey: string;
  kind: "recruitment" | "confirmation";
  purpose: "recruitment" | "confirmation" | "confirmation_resend";
  recruitmentId: Id<"recruitments">;
  shopId: Id<"shops">;
  targetStaffIds: readonly Id<"staffs">[];
  dedupeSuffix: string;
  supersedeActiveOperations?: boolean;
  previousOperationKey?: string;
  confirmationOperationKeyAtOrigin?: string | null;
  recruitmentDraftSavedAtAtOrigin?: number | null;
  organizationBillingVersionAtOrigin?: number;
  notificationRunId?: number;
};

/**
 * fanout対象はoperation作成時に固定する。順序も正規化し、再開時に同じcursorが同じ対象を指すようにする。
 */
export function normalizeNotificationFanoutTargetStaffIds(targetStaffIds: readonly Id<"staffs">[]): Id<"staffs">[] {
  const normalized = [...new Set(targetStaffIds)].sort((left, right) => String(left).localeCompare(String(right)));
  if (normalized.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
    throw new Error("Notification fanout scope exceeds the supported limit");
  }
  return normalized;
}

export function buildNotificationFanoutTargetKey(operationKey: string, staffId: Id<"staffs">): string {
  return `fanout:${operationKey}:${staffId}`;
}

export function isSupplementalConfirmationFanoutStale(
  operation: Doc<"notificationFanoutOperations">,
  recruitment: Doc<"recruitments">,
) {
  if (operation.kind !== "confirmation" || operation.supersedesActiveOperations !== false) return false;
  return (
    operation.confirmationOperationKeyAtOrigin === undefined ||
    operation.recruitmentDraftSavedAtAtOrigin === undefined ||
    operation.confirmationOperationKeyAtOrigin !== (recruitment.lastConfirmationNotificationOperationKey ?? null) ||
    operation.recruitmentDraftSavedAtAtOrigin !== (recruitment.draftSavedAt ?? null)
  );
}

async function cancelNotificationFanoutSchedule(ctx: MutationCtx, operation: Doc<"notificationFanoutOperations">) {
  if (!operation.scheduledFunctionId) return;
  const scheduled = await ctx.db.system.get(operation.scheduledFunctionId);
  if (scheduled?.state.kind === "pending" || scheduled?.state.kind === "inProgress") {
    await ctx.scheduler.cancel(operation.scheduledFunctionId);
  }
}

/**
 * 同じsemantic keyの開始要求を一つのoperationへ収束させる。
 * 確定通知は最新の内容だけを配るため、異なる非終端operationをsupersedeする。
 */
export async function ensureNotificationFanoutOperation(
  ctx: MutationCtx,
  args: EnsureNotificationFanoutOperationArgs,
): Promise<{ operation: Doc<"notificationFanoutOperations">; created: boolean }> {
  if (
    args.supersedeActiveOperations === false &&
    (args.kind !== "confirmation" ||
      args.confirmationOperationKeyAtOrigin === undefined ||
      args.recruitmentDraftSavedAtAtOrigin === undefined)
  ) {
    throw new Error("Supplemental confirmation fanout requires an explicit acceptance baseline");
  }

  const existing = await ctx.db
    .query("notificationFanoutOperations")
    .withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey))
    .unique();
  if (existing) return { operation: existing, created: false };

  const now = Date.now();
  const previousOperationKey = args.previousOperationKey;
  if (args.supersedeActiveOperations !== false && previousOperationKey) {
    const previousOperation = await ctx.db
      .query("notificationFanoutOperations")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", previousOperationKey))
      .unique();
    if (
      previousOperation &&
      previousOperation.kind === args.kind &&
      previousOperation.recruitmentId === args.recruitmentId &&
      previousOperation.shopId === args.shopId &&
      // TODO[narrow]: 全deploymentでm030完走・missingSupersedesActiveOperations=0確認後はbooleanを直接読む。
      previousOperation.supersedesActiveOperations !== false &&
      (previousOperation.status === "pending" || previousOperation.status === "processing")
    ) {
      await cancelNotificationFanoutSchedule(ctx, previousOperation);
      await ctx.db.patch(previousOperation._id, {
        status: "cancelled",
        cancelReason: "superseded",
        cancelledAt: now,
        scheduledFunctionId: undefined,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
    }
  }

  const targetStaffIds = normalizeNotificationFanoutTargetStaffIds(args.targetStaffIds);
  const operationId = await ctx.db.insert("notificationFanoutOperations", {
    operationKey: args.operationKey,
    kind: args.kind,
    purpose: args.purpose,
    recruitmentId: args.recruitmentId,
    shopId: args.shopId,
    targetStaffIds,
    cursor: 0,
    status: "pending",
    dedupeSuffix: args.dedupeSuffix,
    supersedesActiveOperations: args.supersedeActiveOperations !== false,
    ...(args.confirmationOperationKeyAtOrigin === undefined
      ? {}
      : { confirmationOperationKeyAtOrigin: args.confirmationOperationKeyAtOrigin }),
    ...(args.recruitmentDraftSavedAtAtOrigin === undefined
      ? {}
      : { recruitmentDraftSavedAtAtOrigin: args.recruitmentDraftSavedAtAtOrigin }),
    ...(args.organizationBillingVersionAtOrigin !== undefined
      ? { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }
      : {}),
    ...(args.notificationRunId !== undefined ? { notificationRunId: args.notificationRunId } : {}),
    createdAt: now,
    updatedAt: now,
  });
  const operation = await ctx.db.get(operationId);
  if (!operation) throw new Error("Notification fanout operation was not created");
  return { operation, created: true };
}

/** 募集削除と同じtransactionでboundedな即時停止を行う。残りも募集失効の再検証で配送できない。 */
export async function cancelNotificationFanoutOperationsForRecruitment(
  ctx: MutationCtx,
  recruitmentId: Id<"recruitments">,
) {
  const now = Date.now();
  for (const status of ["pending", "processing"] as const) {
    // 個別再送が多数残っても募集削除を失敗させない。残存operationはclaim/enqueue時に失効を検知する。
    const operations = await ctx.db
      .query("notificationFanoutOperations")
      .withIndex("by_recruitmentId_status", (q) => q.eq("recruitmentId", recruitmentId).eq("status", status))
      .take(NOTIFICATION_FANOUT_CANCELLATION_BATCH_SIZE);
    await Promise.all(
      operations.map(async (operation) => {
        await cancelNotificationFanoutSchedule(ctx, operation);
        await ctx.db.patch(operation._id, {
          status: "cancelled",
          cancelReason: "recruitment_inactive",
          cancelledAt: now,
          scheduledFunctionId: undefined,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          updatedAt: now,
        });
      }),
    );
  }
}
