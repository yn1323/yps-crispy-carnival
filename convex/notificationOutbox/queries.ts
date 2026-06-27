import { paginationOptsValidator } from "convex/server";
import { filter } from "convex-helpers/server/filter";
import type { Doc } from "../_generated/dataModel";
import { formatPeriodLabel } from "../_lib/dateFormat";
import { managerQuery } from "../_lib/functions";
import {
  ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS,
  describeNotificationFailureContext,
  getNotificationFailureResendKind,
  isManagerActionableNotificationFailure,
} from "./failureResend";

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};

export const listOpenFailures = managerQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    if (!ctx.shop) return EMPTY_PAGE;
    const shop = ctx.shop;

    // 種別「通知」(other) は再通知できずマネージャーが対応しようがないため一覧に出さない。
    // ページング前に除外しないと、新しい other がページを埋めて対応可能な失敗がカーソルの後ろに
    // 押し出され、初回ページが空になり得る（HeroSummaryカードも出なくなる）。
    // Convex の `.filter()` はページング読み取りに統合されるため、前段で other を落とせる。
    const result = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shop._id).eq("status", "open"))
      .order("desc")
      .filter((q) =>
        q.or(
          ...ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS.map((context) => q.eq(q.field("notificationContext"), context)),
        ),
      )
      .paginate(paginationOpts);

    const page = await Promise.all(
      result.page.map(async (failure) => {
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
      ...result,
      page,
    };
  },
});

export const hasOpenFailures = managerQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.shop) return false;
    const shop = ctx.shop;
    // 種別「通知」(other) は要対応の対象外。対応可能な open 失敗が1件でもあるかだけを返す。
    const actionableFailure = await filter(
      ctx.db
        .query("notificationFailureInbox")
        .withIndex("by_shopId_status_lastFailedAt", (q) => q.eq("shopId", shop._id).eq("status", "open")),
      (failure) => isManagerActionableNotificationFailure(failure.notificationContext),
    ).first();
    return actionableFailure !== null;
  },
});

function canRetryFailure(failure: Doc<"notificationFailureInbox">) {
  if (failure.sourceType === "outbox") return Boolean(failure.outboxId);
  return Boolean(
    failure.staffId && failure.recruitmentId && getNotificationFailureResendKind(failure.notificationContext),
  );
}
