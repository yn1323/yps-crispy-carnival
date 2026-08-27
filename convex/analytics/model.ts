import { v } from "convex/values";

// v2はplan IDをstandard | proへ揃えたsource payload / projection世代。
export const ANALYTICS_SCHEMA_VERSION = 2;
export const ANALYTICS_PAYLOAD_VERSION = 2;
export const ANALYTICS_CALCULATION_VERSION = 2;

export const analyticsCanonicalPlanValidator = v.union(
  v.literal("trial"),
  v.literal("free"),
  v.literal("standard"),
  v.literal("pro"),
);

// Widen中の保存shape。m043+reset後のwriter/read APIはcanonical validatorだけを使う。
export const analyticsPlanValidator = v.union(analyticsCanonicalPlanValidator, v.literal("business"));

export const analyticsCompletenessValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("unavailable"),
);

export const analyticsRatePairValidator = v.object({
  numerator: v.number(),
  denominator: v.number(),
});

export const analyticsMilestoneCountsValidator = v.object({
  registered: v.number(),
  firstRecruitment: v.number(),
  firstSubmission: v.number(),
  firstConfirmed: v.number(),
  secondConfirmed: v.number(),
});

export const analyticsMilestoneDatesValidator = v.object({
  registeredAt: v.number(),
  firstRecruitmentAt: v.optional(v.number()),
  firstSubmissionAt: v.optional(v.number()),
  firstConfirmedAt: v.optional(v.number()),
  secondConfirmedAt: v.optional(v.number()),
});

export const ANALYTICS_HEALTH_SIGNALS = [
  "hasUpcomingCycle",
  "nextCycleMissing",
  "cadenceDelayed",
  "notificationFailure",
  "submissionDrop",
  "confirmationDelay",
  "longInactive",
  "insufficientData",
] as const;

export const analyticsHealthSignalValidator = v.union(...ANALYTICS_HEALTH_SIGNALS.map((signal) => v.literal(signal)));

export const analyticsHealthSignalCountsValidator = v.object({
  hasUpcomingCycle: v.number(),
  nextCycleMissing: v.number(),
  cadenceDelayed: v.number(),
  notificationFailure: v.number(),
  submissionDrop: v.number(),
  confirmationDelay: v.number(),
  longInactive: v.number(),
  insufficientData: v.number(),
});

export const analyticsHealthSignalStateValidator = v.object({
  signal: analyticsHealthSignalValidator,
  startedAt: v.number(),
});

export const analyticsCadenceValidator = v.union(
  v.object({ kind: v.literal("insufficientData") }),
  v.object({
    kind: v.literal("estimated"),
    days: v.number(),
    confidence: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  }),
);

export const analyticsSegmentDimensionValidator = v.union(
  v.literal("registrationCohort"),
  v.literal("plan"),
  v.literal("organizationShopCount"),
  v.literal("shopStaffSize"),
  v.literal("cadence"),
  v.literal("lineUsage"),
  v.literal("submissionTrend"),
  v.literal("adoptionAge"),
);

export const analyticsNotificationKindValidator = v.union(
  v.literal("recruitment"),
  v.literal("reminder"),
  v.literal("confirmation"),
  v.literal("other"),
);

export const analyticsSourceEventTypeValidator = v.union(
  v.literal("organization.changed"),
  v.literal("shop.changed"),
  v.literal("person.changed"),
  v.literal("managerMembership.changed"),
  v.literal("staffMembership.changed"),
  v.literal("plan.changed"),
  v.literal("cycle.changed"),
  v.literal("submission.first"),
  v.literal("lineAccount.changed"),
);

// source eventはこの限定union以外を保存できず、氏名・email・LINE user ID・提出内容を受け取らない。
export const analyticsSourceEventPayloadValidator = v.union(
  v.object({
    kind: v.literal("organization"),
    change: v.union(v.literal("created"), v.literal("updated"), v.literal("deleted")),
    displayName: v.optional(v.string()),
    registeredAt: v.optional(v.number()),
    currentPlan: v.optional(analyticsPlanValidator),
    initialShop: v.optional(
      v.object({
        shopId: v.id("shops"),
        displayName: v.string(),
        registeredAt: v.number(),
      }),
    ),
    initialPersonId: v.optional(v.id("organizationPeople")),
    initialStaff: v.optional(
      v.object({
        staffId: v.id("staffs"),
        organizationPersonId: v.id("organizationPeople"),
        shopId: v.id("shops"),
        validFrom: v.number(),
        isShiftTarget: v.boolean(),
      }),
    ),
  }),
  v.object({
    kind: v.literal("shop"),
    change: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("archived"),
      v.literal("reactivated"),
      v.literal("deleted"),
    ),
    displayName: v.optional(v.string()),
    registeredAt: v.optional(v.number()),
    initialStaff: v.optional(
      v.object({
        staffId: v.id("staffs"),
        organizationPersonId: v.optional(v.id("organizationPeople")),
        validFrom: v.number(),
        isShiftTarget: v.boolean(),
      }),
    ),
  }),
  v.object({
    kind: v.literal("person"),
    status: v.union(v.literal("active"), v.literal("removed")),
    firstObservedAt: v.number(),
  }),
  v.object({
    kind: v.literal("managerMembership"),
    personId: v.id("organizationPeople"),
    personFirstObservedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("removed")),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("managerMembershipExchange"),
    formerPersonId: v.id("organizationPeople"),
    nextPersonId: v.id("organizationPeople"),
    validFrom: v.number(),
    nextPersonFirstObservedAt: v.number(),
  }),
  v.object({
    kind: v.literal("staffMembership"),
    staffId: v.id("staffs"),
    organizationPersonId: v.optional(v.id("organizationPeople")),
    personFirstObservedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("removed")),
    isShiftTarget: v.boolean(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    lineLinked: v.optional(v.boolean()),
    lineFollowing: v.optional(v.boolean()),
  }),
  v.object({
    kind: v.literal("staffMembershipBatch"),
    memberships: v.array(
      v.object({
        staffId: v.id("staffs"),
        organizationPersonId: v.optional(v.id("organizationPeople")),
        personFirstObservedAt: v.optional(v.number()),
        isShiftTarget: v.boolean(),
        validFrom: v.number(),
        lineLinked: v.boolean(),
        lineFollowing: v.boolean(),
      }),
    ),
  }),
  v.object({
    kind: v.literal("plan"),
    plan: v.optional(analyticsPlanValidator),
    billingVersion: v.number(),
    effectiveAt: v.number(),
    statusDeltas: v.array(
      v.union(
        v.object({
          kind: v.literal("shop"),
          shopId: v.id("shops"),
          status: v.union(v.literal("active"), v.literal("archived")),
        }),
        v.object({
          kind: v.literal("manager"),
          memberId: v.id("organizationMembers"),
          personId: v.id("organizationPeople"),
          status: v.union(v.literal("active"), v.literal("removed")),
        }),
      ),
    ),
  }),
  v.object({
    kind: v.literal("cycle"),
    status: v.union(v.literal("open"), v.literal("confirmed"), v.literal("deleted")),
    createdAt: v.number(),
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
    confirmedAt: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("submissionFirst"),
    staffId: v.id("staffs"),
    firstSubmittedAt: v.number(),
  }),
  v.object({
    kind: v.literal("lineAccount"),
    staffId: v.id("staffs"),
    linked: v.boolean(),
    following: v.boolean(),
  }),
  v.object({
    kind: v.literal("lineAccountBatch"),
    isComplete: v.boolean(),
    accounts: v.array(
      v.object({
        staffId: v.id("staffs"),
        linked: v.boolean(),
        following: v.boolean(),
        occurredAt: v.number(),
      }),
    ),
  }),
);

export const analyticsRunKindValidator = v.union(v.literal("daily"), v.literal("reset"), v.literal("maintenance"));

export const analyticsRunStatusValidator = v.union(v.literal("running"), v.literal("complete"), v.literal("failed"));

// 日次の公開stageは六つだけにする。reset/maintenanceは同じmanifestを使うが、
// 通常の日次制御へcleanupや監査の細かなphaseを混ぜない。
export const analyticsRunStageValidator = v.union(
  v.literal("sourceFacts"),
  v.literal("notifications"),
  v.literal("shops"),
  v.literal("organizations"),
  v.literal("segmentsAndService"),
  v.literal("publish"),
  v.literal("resetCleanup"),
  v.literal("resetOrganizations"),
  v.literal("resetShops"),
  v.literal("resetPeople"),
  v.literal("resetManagers"),
  v.literal("resetStaffs"),
  v.literal("resetCycles"),
  v.literal("resetReplay"),
  v.literal("resetVerify"),
  v.literal("maintenanceAudit"),
  v.literal("maintenanceCleanup"),
);

export const emptyMilestoneCounts = () => ({
  registered: 0,
  firstRecruitment: 0,
  firstSubmission: 0,
  firstConfirmed: 0,
  secondConfirmed: 0,
});

export const emptyHealthSignalCounts = () => ({
  hasUpcomingCycle: 0,
  nextCycleMissing: 0,
  cadenceDelayed: 0,
  notificationFailure: 0,
  submissionDrop: 0,
  confirmationDelay: 0,
  longInactive: 0,
  insufficientData: 0,
});

export const emptyRatePair = () => ({ numerator: 0, denominator: 0 });
