import { v } from "convex/values";
import { analyticsCountsValidator, analyticsMetricValidator } from "../analytics/model";
import {
  notificationChannelValidator,
  notificationHistoryDeliveryStatusValidator,
  notificationHistorySendStatusValidator,
  notificationOutboxStatusValidator,
  notificationPurposeValidator,
} from "../notificationOutbox/schemas";

export const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
export const pageArgs = { cursor: nullableString, limit: v.number() };
const planValidator = v.union(v.literal("free"), v.literal("standard"), v.literal("pro"));
const nullablePlan = v.union(planValidator, v.null());
export const billingSummaryValidator = v.object({
  kind: v.union(
    v.literal("trial"),
    v.literal("initialPaymentPending"),
    v.literal("pendingActivation"),
    v.literal("active"),
    v.literal("complimentary"),
    v.literal("scheduledChange"),
    v.literal("paymentTerminationPending"),
  ),
  plan: nullablePlan,
  targetPlan: nullablePlan,
  dueAt: nullableNumber,
});
const nullableBillingSummary = v.union(billingSummaryValidator, v.null());
const recruitmentPeriodValidator = v.object({
  recruitmentId: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
});
export const notificationCategoryValidator = v.union(
  v.literal("recruitment"),
  v.literal("reminder"),
  v.literal("confirmation"),
  v.literal("lineInvite"),
  v.literal("legalConsent"),
  v.literal("manager"),
  v.literal("other"),
);
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
  billing: v.object({
    organizationCount: v.number(),
    counts: v.object({
      trial: v.number(),
      initialPaymentPending: v.number(),
      pendingActivation: v.number(),
      active: v.number(),
      complimentary: v.number(),
      scheduledChange: v.number(),
      paymentTerminationPending: v.number(),
    }),
    activeByPlan: v.object({ free: v.number(), standard: v.number(), pro: v.number() }),
    trialEndingWithin7Days: v.number(),
    isPartial: v.boolean(),
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
  lastActivityDate: nullableString,
  billing: nullableBillingSummary,
  attention: v.array(v.union(v.literal("shift_ended"), v.literal("inactive"))),
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
    billing: nullableBillingSummary,
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
    staff: staffRowValidator.extend({ email: v.string(), personId: v.string(), userId: nullableString }),
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
export const notificationSearchResponseValidator = v.union(
  v.null(),
  v.object({
    kind: v.literal("notifications"),
    asOf: v.number(),
    mode: v.union(v.literal("filter"), v.literal("lookup")),
    range: v.union(v.object({ from: v.string(), to: v.string() }), v.null()),
    shop: v.union(shopRowValidator, v.null()),
    rows: v.array(
      v.object({
        id: v.string(),
        createdAt: v.number(),
        status: notificationOutboxStatusValidator,
        channel: notificationChannelValidator,
        purpose: notificationPurposeValidator,
        category: notificationCategoryValidator,
        notificationContext: v.string(),
        shop: v.union(v.object({ shopId: v.string(), name: v.string(), isDeleted: v.boolean() }), v.null()),
        organizationName: nullableString,
        recipient: v.object({
          kind: v.union(v.literal("staff"), v.literal("manager"), v.literal("invitation"), v.literal("none")),
          name: nullableString,
          staffId: nullableString,
        }),
        recruitment: v.union(recruitmentPeriodValidator, v.null()),
        ids: v.object({
          organizationId: v.string(),
          shopId: nullableString,
          staffId: nullableString,
          userId: nullableString,
          recruitmentId: nullableString,
          invitationId: nullableString,
        }),
        attemptCount: v.number(),
        nextRunAt: nullableNumber,
        sentAt: nullableNumber,
        failedAt: nullableNumber,
        cancelledAt: nullableNumber,
        errorCode: nullableString,
        cancelReason: nullableString,
        deliverySuppressed: v.boolean(),
        resendEmailId: nullableString,
        deliveryStatus: v.union(notificationHistoryDeliveryStatusValidator, v.null()),
        deliveredAt: nullableNumber,
        payloadRedacted: v.boolean(),
      }),
    ),
    scannedCount: v.number(),
    pageInfo: pageInfoValidator,
  }),
);
const partialCountValidator = v.object({ count: v.number(), isPartial: v.boolean() });
export const notificationSummaryResponseValidator = v.object({
  kind: v.literal("notificationSummary"),
  asOf: v.number(),
  month: v.object({
    month: v.string(),
    email: v.number(),
    line: v.number(),
    shopCount: v.number(),
    isPartial: v.boolean(),
  }),
  failedLast7Days: partialCountValidator,
  delayed: v.object({ pending: v.number(), processing: v.number(), isPartial: v.boolean() }),
  lineQuota: v.union(
    v.object({
      status: v.union(v.literal("normal"), v.literal("exceeded")),
      remaining: v.number(),
      totalQuota: v.number(),
      checkedAt: v.number(),
    }),
    v.null(),
  ),
});
export const staffTimelineEventTypeValidator = v.union(
  v.literal("staff_created"),
  v.literal("registration_requested"),
  v.literal("registration_reviewed"),
  v.literal("legal_consent_link_issued"),
  v.literal("legal_consent_link_used"),
  v.literal("legal_consented"),
  v.literal("submit_link_issued"),
  v.literal("view_link_issued"),
  v.literal("view_link_used"),
  v.literal("session_started"),
  v.literal("first_submitted"),
  v.literal("last_submitted"),
  v.literal("line_link_issued"),
  v.literal("line_link_used"),
  v.literal("line_linked"),
  v.literal("line_unlinked"),
  v.literal("line_unfollowed"),
  v.literal("notification_requested"),
  v.literal("feature_request_sent"),
);
export const staffTimelineResponseValidator = v.union(
  v.null(),
  v.object({
    kind: v.literal("staffTimeline"),
    asOf: v.number(),
    events: v.array(
      v.object({
        at: v.number(),
        type: staffTimelineEventTypeValidator,
        recruitment: v.union(recruitmentPeriodValidator, v.null()),
        detail: nullableString,
        status: nullableString,
      }),
    ),
    isTruncated: v.boolean(),
  }),
);
export const organizationEventsResponseValidator = v.union(
  v.null(),
  v.object({
    kind: v.literal("organizationEvents"),
    asOf: v.number(),
    organizationId: v.string(),
    organizationName: v.string(),
    rows: v.array(
      v.object({
        id: v.string(),
        occurredAt: v.number(),
        action: v.string(),
        actorName: nullableString,
        actorUserId: nullableString,
        targetKind: nullableString,
        targetId: nullableString,
        targetName: nullableString,
        fromState: nullableString,
        toState: nullableString,
      }),
    ),
    pageInfo: pageInfoValidator,
  }),
);
const staffAccessKind = v.union(v.literal("submit"), v.literal("view"));
export const magicLinkLookupResponseValidator = v.object({
  kind: v.literal("magicLinkLookup"),
  asOf: v.number(),
  link: v.union(
    v.null(),
    v.object({
      id: v.string(),
      accessKind: staffAccessKind,
      createdAt: v.number(),
      expiresAt: v.number(),
      usedAt: nullableNumber,
      revokedAt: nullableNumber,
      ids: v.object({
        organizationId: nullableString,
        shopId: v.string(),
        staffId: v.string(),
        personId: nullableString,
        userId: nullableString,
        recruitmentId: v.string(),
      }),
      shopName: nullableString,
      organizationName: nullableString,
      shopAvailable: v.boolean(),
      staff: v.union(
        v.object({ name: nullableString, isDeleted: v.boolean(), excludedFromShift: v.boolean() }),
        v.null(),
      ),
      recruitment: v.union(
        v.object({
          periodStart: v.string(),
          periodEnd: v.string(),
          deadline: v.string(),
          status: v.union(v.literal("open"), v.literal("confirmed")),
          isDeleted: v.boolean(),
        }),
        v.null(),
      ),
      submitCutoffAt: nullableNumber,
      sessions: v.array(
        v.object({
          createdAt: v.number(),
          expiresAt: v.number(),
          accessKind: staffAccessKind,
          revokedAt: nullableNumber,
        }),
      ),
      diagnosis: v.object({
        result: v.union(
          v.literal("ok"),
          v.literal("invalid_link"),
          v.literal("recruitment_deleted"),
          v.literal("submission_closed"),
        ),
        reason: v.union(
          v.literal("ok"),
          v.literal("duplicate_token"),
          v.literal("revoked"),
          v.literal("recruitment_mismatch"),
          v.literal("recruitment_deleted"),
          v.literal("staff_unavailable"),
          v.literal("shop_unavailable"),
          v.literal("recruitment_status"),
          v.literal("submit_cutoff"),
          v.literal("expired"),
          v.literal("used"),
        ),
      }),
    }),
  ),
});
