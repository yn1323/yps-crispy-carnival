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
export const analyticsRunStatusValidator = v.union(v.literal("running"), v.literal("complete"), v.literal("failed"));
export type AnalyticsMetric = Infer<typeof analyticsMetricValidator>;
export type AnalyticsCounts = Infer<typeof analyticsCountsValidator>;
export type AnalyticsResultCounts = Infer<typeof analyticsResultCountsValidator>;

export function emptyAnalyticsCounts(): AnalyticsCounts {
  return { registered: 0, submitted: 0, confirmed: 0 };
}

export function emptyAnalyticsResultCounts(): AnalyticsResultCounts {
  return {
    day: emptyAnalyticsCounts(),
    days7: emptyAnalyticsCounts(),
    days30: emptyAnalyticsCounts(),
    days90: emptyAnalyticsCounts(),
  };
}
