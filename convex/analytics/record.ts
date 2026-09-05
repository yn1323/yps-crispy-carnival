import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { dateJST } from "../_lib/dateFormat";
import { ANALYTICS_DEFINITION_VERSION } from "./model";

export async function ensureAnalyticsState(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("analyticsState")
    .withIndex("by_key", (q) => q.eq("key", "usage"))
    .unique();
  if (existing) return existing;
  const startedAt = Date.now();
  const id = await ctx.db.insert("analyticsState", {
    key: "usage",
    definitionVersion: ANALYTICS_DEFINITION_VERSION,
    startedAt,
    nextRecoveryDate: dateJST(startedAt),
  });
  const state = await ctx.db.get(id);
  if (!state) throw new Error("analytics_state_missing");
  return state;
}

type UsageInput = { shopId: Id<"shops"> } & (
  | { metric: "registered" }
  | { metric: "submitted"; recruitmentId: Id<"recruitments"> }
  | { metric: "confirmed"; recruitmentId: Id<"recruitments">; confirmedPeriodStartAt: number }
);

/** 認可と業務保存を終えたmutationから呼ぶ。受理時刻と成功は業務transactionと共有する。 */
export async function recordAnalyticsUsage(ctx: MutationCtx, args: UsageInput) {
  await ensureAnalyticsState(ctx);
  const now = Date.now();
  const date = dateJST(now);
  const day = await ctx.db
    .query("analyticsShopDays")
    .withIndex("by_shopId_and_date", (q) => q.eq("shopId", args.shopId).eq("date", date))
    .unique();
  if (!day) {
    await ctx.db.insert("analyticsShopDays", {
      shopId: args.shopId,
      date,
      registered: args.metric === "registered",
      submitted: args.metric === "submitted",
      confirmed: args.metric === "confirmed",
    });
  } else if (!day[args.metric]) {
    await ctx.db.patch(day._id, { [args.metric]: true });
  }
  if (args.metric === "registered") return;

  const cycle = await ctx.db
    .query("analyticsCycleEvidence")
    .withIndex("by_shopId_and_recruitmentId", (q) =>
      q.eq("shopId", args.shopId).eq("recruitmentId", args.recruitmentId),
    )
    .unique();
  // 確定時の期間開始はlastConfirmedAtと対にする。初回観測時刻とは混ぜない。
  const observed =
    args.metric === "submitted"
      ? { firstSubmittedAt: cycle?.firstSubmittedAt ?? now, lastSubmittedAt: now }
      : {
          firstConfirmedAt: cycle?.firstConfirmedAt ?? now,
          lastConfirmedAt: now,
          confirmedPeriodStartAt: args.confirmedPeriodStartAt,
        };
  if (cycle) await ctx.db.patch(cycle._id, { ...observed, lastObservedAt: now });
  else
    await ctx.db.insert("analyticsCycleEvidence", {
      shopId: args.shopId,
      recruitmentId: args.recruitmentId,
      ...observed,
      lastObservedAt: now,
    });
}
