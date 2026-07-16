import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { filter } from "convex-helpers/server/filter";
import type { Doc } from "../_generated/dataModel";
import { formatPeriodLabel } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import { isManagerVisibleNotificationFailure } from "./failureEligibility";
import {
  ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS,
  describeNotificationFailureContext,
  getNotificationFailureResendKind,
  isLineInviteResendContext,
} from "./failureResend";
import {
  notificationChannelValidator,
  notificationFailureInboxSourceTypeValidator,
  notificationFailureInboxStatusValidator,
} from "./schemas";

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};
const VISIBLE_FAILURE_PAGINATION_SCAN_LIMIT = 20;

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

export const listOpenFailures = managerQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(managerNotificationFailureValidator),
  handler: async (ctx, { paginationOpts }) => {
    if (!ctx.shop) return EMPTY_PAGE;
    const shop = ctx.shop;

    // 再通知できない種別や終了済み募集はマネージャーが対応しようがないため一覧に出さない。
    // 終了済み募集の判定は recruitment 参照が必要なので、非表示レコードでページが埋まらないように走査する。
    const buildBaseQuery = () =>
      ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shop._id).eq("status", "open"))
        .order("desc")
        .filter((q) =>
          q.or(
            ...ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS.map((context) => q.eq(q.field("notificationContext"), context)),
          ),
        );

    let cursor = paginationOpts.cursor;
    let isDone = false;
    let continueCursor = "";
    const visibleFailures: Doc<"notificationFailureInbox">[] = [];

    for (
      let scanCount = 0;
      scanCount < VISIBLE_FAILURE_PAGINATION_SCAN_LIMIT && visibleFailures.length < paginationOpts.numItems;
      scanCount++
    ) {
      const result = await buildBaseQuery().paginate({
        cursor,
        numItems: paginationOpts.numItems - visibleFailures.length,
      });
      for (const failure of result.page) {
        if (await isManagerVisibleNotificationFailure(ctx, failure)) {
          visibleFailures.push(failure);
        }
      }
      isDone = result.isDone;
      continueCursor = result.continueCursor;
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    const page = await Promise.all(
      visibleFailures.map(async (failure) => {
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
      isDone,
      continueCursor,
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
