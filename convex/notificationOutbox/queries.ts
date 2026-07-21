import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { filter } from "convex-helpers/server/filter";
import { paginator } from "convex-helpers/server/pagination";
import type { Doc } from "../_generated/dataModel";
import { formatPeriodLabel } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import schema from "../schema";
import { isManagerVisibleNotificationFailure } from "./failureEligibility";
import {
  describeNotificationFailureContext,
  getNotificationFailureResendKind,
  isLineInviteResendContext,
} from "./failureResend";
import { notificationHistoryDisplayStatus } from "./history";
import {
  notificationChannelValidator,
  notificationFailureInboxSourceTypeValidator,
  notificationFailureInboxStatusValidator,
  notificationHistoryDisplayStatusValidator,
} from "./schemas";

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};
const VISIBLE_FAILURE_PAGINATION_SCAN_MULTIPLIER = 20;

const managerNotificationHistoryValidator = v.object({
  _id: v.id("notificationHistory"),
  requestedAt: v.number(),
  sentAt: v.optional(v.number()),
  channel: notificationChannelValidator,
  displayTitle: v.string(),
  displayStatus: notificationHistoryDisplayStatusValidator,
});

const managerNotificationFailureValidator = v.object({
  _id: v.id("notificationFailureInbox"),
  sourceType: notificationFailureInboxSourceTypeValidator,
  status: notificationFailureInboxStatusValidator,
  shopId: v.id("shops"),
  recruitmentId: v.optional(v.id("recruitments")),
  staffId: v.optional(v.id("staffs")),
  userId: v.optional(v.id("users")),
  outboxId: v.optional(v.id("notificationOutbox")),
  channel: v.optional(notificationChannelValidator),
  dedupeKey: v.string(),
  notificationContext: v.string(),
  notificationKind: v.union(
    v.literal("recruitment"),
    v.literal("reminder"),
    v.literal("confirmation"),
    v.literal("lineInvite"),
    v.literal("other"),
  ),
  notificationKindLabel: v.string(),
  staffName: v.string(),
  periodLabel: v.union(v.string(), v.null()),
  firstFailedAt: v.number(),
  lastFailedAt: v.number(),
  attemptCount: v.optional(v.number()),
  canRetry: v.boolean(),
});

export const listStaffNotificationHistory = managerQuery({
  args: {
    staffId: v.id("staffs"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(managerNotificationHistoryValidator),
  handler: async (ctx, { staffId, paginationOpts }) => {
    if (!ctx.shop) return EMPTY_PAGE;
    const shop = ctx.shop;

    const staff = await ctx.db.get(staffId);
    if (!staff || staff.isDeleted || staff.shopId !== shop._id) return EMPTY_PAGE;

    const histories = await ctx.db
      .query("notificationHistory")
      .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shop._id).eq("staffId", staffId))
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...histories,
      page: histories.page.map((history) => ({
        _id: history._id,
        requestedAt: history.requestedAt,
        ...(history.sentAt !== undefined ? { sentAt: history.sentAt } : {}),
        channel: history.channel,
        displayTitle: history.displayTitle,
        displayStatus: notificationHistoryDisplayStatus(history),
      })),
    };
  },
});

export const listOpenFailures = managerQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(managerNotificationFailureValidator),
  handler: async (ctx, { paginationOpts }) => {
    if (!ctx.shop) return EMPTY_PAGE;
    const shop = ctx.shop;

    // 再通知できない種別や終了済み募集はマネージャーが対応しようがないため一覧に出さない。
    // filterWith をページング前に適用し、1回の paginate で非表示レコードを越えて可視件数を満たす。
    const scanLimit = Math.max(1, paginationOpts.numItems) * VISIBLE_FAILURE_PAGINATION_SCAN_MULTIPLIER;
    const maximumRowsRead = Math.max(1, Math.min(paginationOpts.maximumRowsRead ?? scanLimit, scanLimit));
    const visibleFailures = await paginator(ctx.db, schema)
      .query("notificationFailureInbox")
      .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shop._id).eq("status", "open"))
      .order("desc")
      .filterWith(async (failure) => await isManagerVisibleNotificationFailure(ctx, failure))
      .paginate({
        ...paginationOpts,
        maximumRowsRead,
      });

    const page = await Promise.all(
      visibleFailures.page.map(async (failure) => {
        const [staff, recruitment] = await Promise.all([
          failure.staffId ? ctx.db.get(failure.staffId) : null,
          failure.recruitmentId ? ctx.db.get(failure.recruitmentId) : null,
        ]);
        const context = describeNotificationFailureContext(failure.notificationContext);

        return {
          _id: failure._id,
          sourceType: failure.sourceType,
          status: failure.status,
          shopId: failure.shopId,
          recruitmentId: failure.recruitmentId,
          staffId: failure.staffId,
          userId: failure.userId,
          outboxId: failure.outboxId,
          channel: failure.channel,
          dedupeKey: failure.dedupeKey,
          notificationContext: failure.notificationContext,
          notificationKind: context.kind,
          notificationKindLabel: context.label,
          staffName: staff?.name ?? "不明なスタッフ",
          periodLabel: recruitment ? formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd) : null,
          firstFailedAt: failure.firstFailedAt,
          lastFailedAt: failure.lastFailedAt,
          attemptCount: failure.attemptCount,
          canRetry: canRetryFailure(failure),
        };
      }),
    );

    return {
      ...visibleFailures,
      page,
    };
  },
});

export const hasOpenFailures = managerQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    if (!ctx.shop) return false;
    const shop = ctx.shop;
    // Dashboard に表示できる open 失敗が1件でもあるかだけを返す。
    const actionableFailure = await filter(
      ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shop._id).eq("status", "open")),
      async (failure) => await isManagerVisibleNotificationFailure(ctx, failure),
    ).first();
    return actionableFailure !== null;
  },
});

function canRetryFailure(failure: Doc<"notificationFailureInbox">) {
  // LINE連携案内は募集に紐づかず、スタッフIDから連携依頼メールを送り直せる（新しいマジックリンクを発行）。
  if (isLineInviteResendContext(failure.notificationContext)) return Boolean(failure.staffId);
  if (failure.sourceType === "outbox") return Boolean(failure.outboxId);
  return Boolean(
    failure.staffId && failure.recruitmentId && getNotificationFailureResendKind(failure.notificationContext),
  );
}
