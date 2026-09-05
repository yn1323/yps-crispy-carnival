import { v } from "convex/values";
import { analyticsCountsValidator, analyticsMetricValidator } from "../analytics/model";
import {
  notificationChannelValidator,
  notificationHistoryDeliveryStatusValidator,
  notificationHistorySendStatusValidator,
} from "../notificationOutbox/schemas";

export const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
export const pageArgs = { cursor: nullableString, limit: v.number() };
export const pageInfoValidator = v.object({
  cursor: nullableString,
  continueCursor: nullableString,
  isDone: v.boolean(),
  pageSize: v.number(),
  returnedCount: v.number(),
});
const dayValidator = v.object({
  date: v.string(),
  status: v.union(
    v.literal("before_start"),
    v.literal("pending"),
    v.literal("running"),
    v.literal("failed"),
    v.literal("complete"),
    v.literal("partial"),
  ),
  counts: v.union(analyticsCountsValidator, v.null()),
  observationStartAt: nullableNumber,
  observationEndAt: nullableNumber,
  computedAt: nullableNumber,
  errorCode: nullableString,
});
export const overviewResponseValidator = v.object({
  kind: v.literal("overview"),
  asOf: v.number(),
  definitionVersion: v.number(),
  startedAt: nullableNumber,
  nextAggregationAt: v.number(),
  range: v.object({ from: v.string(), to: v.string(), days: v.union(v.literal(7), v.literal(30), v.literal(90)) }),
  yesterday: dayValidator,
  series: v.array(dayValidator),
  period: v.object({
    status: v.union(v.literal("complete"), v.literal("partial"), v.literal("unavailable")),
    counts: v.union(analyticsCountsValidator, v.null()),
    observedDays: v.number(),
    observationStartAt: nullableNumber,
  }),
});
export const shopRowValidator = v.object({
  shopId: v.string(),
  name: v.string(),
  organizationId: nullableString,
  organizationName: nullableString,
  registeredAt: nullableNumber,
  isDeleted: v.boolean(),
});
const shopListRowValidator = shopRowValidator.extend({
  staffCount: nullableNumber,
  latestShift: v.union(v.object({ periodStart: v.string(), periodEnd: v.string() }), v.null()),
});
export const shopsResponseValidator = v.object({
  kind: v.literal("shops"),
  asOf: v.number(),
  rows: v.array(shopListRowValidator),
  pageInfo: pageInfoValidator,
  scope: v.union(v.object({ date: v.string(), metric: analyticsMetricValidator }), v.null()),
  scopeStatus: v.union(
    v.literal("current"),
    v.literal("available"),
    v.literal("unavailable"),
    v.literal("outside_retention"),
  ),
});
export const staffRowValidator = v.object({
  staffId: v.string(),
  name: v.string(),
  accountLinked: v.boolean(),
  isManager: v.boolean(),
  excludedFromShift: v.boolean(),
  lineStatus: v.union(
    v.literal("unlinked"),
    v.literal("linked_following"),
    v.literal("linked_unfollowed"),
    v.literal("unavailable"),
  ),
});
export const cycleRowValidator = v.object({
  recruitmentId: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  status: v.union(v.literal("open"), v.literal("confirmed")),
  confirmedAt: nullableNumber,
});
const cycleEvidenceValidator = v.object({
  recruitmentId: v.string(),
  isDeleted: v.boolean(),
  firstSubmittedAt: nullableNumber,
  lastSubmittedAt: nullableNumber,
  firstConfirmedAt: nullableNumber,
  lastConfirmedAt: nullableNumber,
  confirmedPeriodStartAt: nullableNumber,
});
export const shopDetailResponseValidator = v.union(
  v.null(),
  v.object({
    kind: v.literal("shop"),
    asOf: v.number(),
    shop: shopRowValidator,
    regularClosedDays: v.array(v.string()),
    submissionPattern: v.string(),
    staff: v.array(staffRowValidator),
    pageInfo: pageInfoValidator,
    cycles: v.array(cycleRowValidator),
    activity: v.object({
      startedAt: nullableNumber,
      from: v.string(),
      to: v.string(),
      days: v.array(
        v.object({ date: v.string(), registered: v.boolean(), submitted: v.boolean(), confirmed: v.boolean() }),
      ),
      evidence: v.array(cycleEvidenceValidator),
      hasMoreEvidence: v.boolean(),
    }),
  }),
);
export const staffDetailResponseValidator = v.union(
  v.null(),
  v.object({
    kind: v.literal("staff"),
    asOf: v.number(),
    shop: shopRowValidator,
    staff: staffRowValidator.extend({ email: v.string() }),
    memberships: v.array(
      v.object({ shopId: v.string(), shopName: v.string(), staffId: v.string(), excludedFromShift: v.boolean() }),
    ),
    submissions: v.array(cycleRowValidator.extend({ firstSubmittedAt: nullableNumber, submittedAt: nullableNumber })),
    notifications: v.array(
      v.object({
        id: v.string(),
        channel: notificationChannelValidator,
        notificationKind: v.string(),
        sendStatus: notificationHistorySendStatusValidator,
        deliveryStatus: notificationHistoryDeliveryStatusValidator,
        requestedAt: v.number(),
        sentAt: nullableNumber,
        deliveredAt: nullableNumber,
        failedAt: nullableNumber,
      }),
    ),
    pageInfo: pageInfoValidator,
  }),
);
export const cycleDetailResponseValidator = v.union(
  v.null(),
  v.object({
    kind: v.literal("cycle"),
    asOf: v.number(),
    shop: shopRowValidator,
    cycle: cycleRowValidator,
    currentSubmission: v.union(
      v.null(),
      v.object({ numerator: v.number(), denominator: v.number(), rate: nullableNumber }),
    ),
    currentSubmissionStatus: v.union(v.literal("available"), v.literal("scan_limit")),
    confirmedBeforeStart: v.union(v.boolean(), v.null()),
    deadlineSubmissionRate: v.null(),
  }),
);
export const featureRequestsResponseValidator = v.object({
  kind: v.literal("requests"),
  asOf: v.number(),
  pageInfo: pageInfoValidator,
  rows: v.array(
    v.object({
      id: v.string(),
      targetKind: v.union(v.literal("shop"), v.literal("organization")),
      organizationId: nullableString,
      organizationName: nullableString,
      shopId: nullableString,
      shopName: v.string(),
      senderType: v.union(v.literal("manager"), v.literal("staff")),
      comment: v.string(),
      createdAt: v.number(),
      isDeleted: v.boolean(),
    }),
  ),
});
export const featureRequestUpdateResponseValidator = v.union(
  v.null(),
  v.object({ kind: v.literal("requestUpdated"), id: v.string(), isDeleted: v.boolean() }),
);
