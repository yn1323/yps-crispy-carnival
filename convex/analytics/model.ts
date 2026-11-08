import { type Infer, v } from "convex/values";

export const ANALYTICS_DEFINITION_VERSION = 1;
export const ANALYTICS_PERIOD_DAYS = [7, 30, 90] as const;
export const ANALYTICS_METRICS = ["registered", "submitted", "confirmed"] as const;
export const analyticsMetricValidator = v.union(
  v.literal("registered"),
  v.literal("submitted"),
  v.literal("confirmed"),
);
export const analyticsCountsValidator = v.object({
  registered: v.number(),
  submitted: v.number(),
  confirmed: v.number(),
});
export const analyticsResultCountsValidator = v.object({
  day: analyticsCountsValidator,
  days7: analyticsCountsValidator,
  days30: analyticsCountsValidator,
  days90: analyticsCountsValidator,
});
const engagedTargetCountsValidator = v.object({ organizations: v.number(), shops: v.number() });
/**
 * 直近14日に通知を受け付けた組織・店舗の数。管理者を含めて2名以上と6名以上に分けて数える。
 * 区分は組織・店舗一覧の人数の絞り込みと同じ。
 */
export const analyticsEngagedCountsValidator = v.object({
  min2: engagedTargetCountsValidator,
  min6: engagedTargetCountsValidator,
});
/**
 * 日次runで、日の終わり時点の組織・店舗を数える段階。組織、店舗の順に全件を読む。
 * cursorCreationTimeは現在の段階で最後に確認した作成時刻で、次のpageはそれより後から読む。
 */
export const analyticsEngagementValidator = v.object({
  stage: v.union(v.literal("organizations"), v.literal("shops"), v.literal("complete")),
  counts: analyticsEngagedCountsValidator,
  cursorCreationTime: v.optional(v.number()),
});
export const analyticsRunStatusValidator = v.union(v.literal("running"), v.literal("complete"), v.literal("failed"));
export type AnalyticsMetric = Infer<typeof analyticsMetricValidator>;
export type AnalyticsCounts = Infer<typeof analyticsCountsValidator>;
export type AnalyticsResultCounts = Infer<typeof analyticsResultCountsValidator>;
export type AnalyticsEngagedCounts = Infer<typeof analyticsEngagedCountsValidator>;
export type AnalyticsEngagement = Infer<typeof analyticsEngagementValidator>;

export function emptyAnalyticsCounts(): AnalyticsCounts {
  return { registered: 0, submitted: 0, confirmed: 0 };
}

export function emptyAnalyticsEngagedCounts(): AnalyticsEngagedCounts {
  return { min2: { organizations: 0, shops: 0 }, min6: { organizations: 0, shops: 0 } };
}

export function emptyAnalyticsResultCounts(): AnalyticsResultCounts {
  return {
    day: emptyAnalyticsCounts(),
    days7: emptyAnalyticsCounts(),
    days30: emptyAnalyticsCounts(),
    days90: emptyAnalyticsCounts(),
  };
}
