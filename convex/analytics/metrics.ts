import type { NotificationFailureKind } from "../notificationOutbox/failureResend";

/**
 * イベント系KPIのmetric名（analyticsDailyEventCounts.metric）。
 * 各metricの数え方・日付の根拠・valueSumの意味は doc/features/analytics.md を参照。
 */
export const ANALYTICS_METRICS = {
  shopCreated: "shop.created",
  staffCreated: "staff.created",
  recruitmentCreated: "recruitment.created",
  // valueSum = 募集作成→確定のリードタイム合計ms（平均 = valueSum / count）
  recruitmentConfirmed: "recruitment.confirmed",
  // valueSum = 確定した募集の提出者数合計。提出率の分子
  recruitmentConfirmedSubmittedTotal: "recruitment.confirmed.submittedTotal",
  // valueSum = 確定した募集の提出対象者数合計。提出率の分母
  recruitmentConfirmedExpectedStaffTotal: "recruitment.confirmed.expectedStaffTotal",
  submissionFirst: "submission.first",
  lineLinked: "line.linked",
  registrationRequested: "staffRegistration.requested",
  registrationApproved: "staffRegistration.approved",
  registrationRejected: "staffRegistration.rejected",
} as const;

export const NOTIFICATION_METRIC_CHANNELS = ["email", "line"] as const;
export const NOTIFICATION_METRIC_OUTCOMES = ["sent", "failed"] as const;
// 通知種別分類の正典 describeNotificationFailureContext() の kind と一致させる
export const NOTIFICATION_METRIC_KINDS = [
  "recruitment",
  "reminder",
  "confirmation",
  "lineInvite",
  "other",
] as const satisfies readonly NotificationFailureKind[];

export type NotificationMetricChannel = (typeof NOTIFICATION_METRIC_CHANNELS)[number];
export type NotificationMetricOutcome = (typeof NOTIFICATION_METRIC_OUTCOMES)[number];
export type NotificationEventMetric =
  `notification.${NotificationMetricChannel}.${NotificationMetricOutcome}.${NotificationFailureKind}`;

export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[keyof typeof ANALYTICS_METRICS] | NotificationEventMetric;

// 催促送信数 = notification.{channel}.sent.reminder（専用metricは持たない）
export function notificationMetric(
  channel: NotificationMetricChannel,
  outcome: NotificationMetricOutcome,
  kind: NotificationFailureKind,
): NotificationEventMetric {
  return `notification.${channel}.${outcome}.${kind}`;
}

/** 通知系metricの全組み合わせ。「未集計」と「0件」を区別するためのゼロ埋めに使う */
export function allNotificationEventMetrics(): NotificationEventMetric[] {
  return NOTIFICATION_METRIC_CHANNELS.flatMap((channel) =>
    NOTIFICATION_METRIC_OUTCOMES.flatMap((outcome) =>
      NOTIFICATION_METRIC_KINDS.map((kind) => notificationMetric(channel, outcome, kind)),
    ),
  );
}
