import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import { ANALYTICS_POLICY } from "../analytics/registry";
import { DAY_MS } from "../constants";
import type { AnalyticsShopUsageLikelihood } from "./dto";
import {
  type AnalyticsRunRange,
  classifyShopUsage,
  hasCompleteRequestedRange,
  toOrganizationRowDto,
  toShopKpiDto,
  toShopRowDto,
  usageMatches,
} from "./queryHelpers";

function shopKpiDoc(kpiEligible: boolean): Doc<"analyticsDailyShopKpis"> {
  return {
    snapshotDate: "2026-05-11",
    kpiEligible,
    staffMembershipCount: 1,
    shiftTargetCount: 1,
    uniquePersonCount: 1,
    unlinkedStaffCount: 0,
    managerMembershipCount: 1,
    managerStaffCount: 1,
    lineLinkedCount: 1,
    lineFollowingCount: 1,
    hasRecentActivity: true,
    cycleCount: 1,
    confirmedCycleCount: 1,
    confirmedBeforeStartCycleCount: 1,
    issueHealthSignalCount: 0,
    milestoneDates: {
      registeredAt: 1,
      firstRecruitmentAt: 2,
      firstSubmissionAt: 3,
      firstConfirmedAt: 4,
      secondConfirmedAt: 5,
    },
    healthSignals: [],
    cadence: { kind: "insufficientData" },
    northStar: { numerator: 1, denominator: 1 },
    deadlineSubmission: { numerator: 1, denominator: 1 },
    finalSubmission: { numerator: 1, denominator: 1 },
    cumulativeDeadlineSubmission: { numerator: 1, denominator: 1 },
    cumulativeFinalSubmission: { numerator: 1, denominator: 1 },
    cumulativeNotificationSentCount: 0,
    cumulativeNotificationFailedCount: 0,
    completeness: "complete",
    computedAt: 10,
  } as unknown as Doc<"analyticsDailyShopKpis">;
}

describe("Analytics Dashboard shop projection", () => {
  it("切替前登録の店舗では登録後milestoneをDTOへ公開しない", () => {
    const kpis = toShopKpiDto(shopKpiDoc(false));
    const row = toShopRowDto(
      {
        organizationId: "organizations:1",
        shopId: "shops:1",
        displayName: "店舗",
        registeredAt: 1,
        firstRecruitmentAt: 2,
        firstSubmissionAt: 3,
        firstConfirmedAt: 4,
        secondConfirmedAt: 5,
        cadenceConfidence: "insufficientData",
        updatedAt: 10,
      } as unknown as Doc<"analyticsShops">,
      "グループ",
      kpis,
    );

    expect(kpis).toMatchObject({
      kpiEligible: false,
      milestoneDates: {
        registeredAt: 1,
        firstRecruitmentAt: null,
        firstSubmissionAt: null,
        firstConfirmedAt: null,
        secondConfirmedAt: null,
      },
    });
    expect(row.milestoneDates).toEqual(kpis.milestoneDates);
  });

  it("切替後登録の店舗では観測したmilestoneをDTOへ公開する", () => {
    expect(toShopKpiDto(shopKpiDoc(true))).toMatchObject({
      kpiEligible: true,
      milestoneDates: {
        registeredAt: 1,
        firstRecruitmentAt: 2,
        firstSubmissionAt: 3,
        firstConfirmedAt: 4,
        secondConfirmedAt: 5,
      },
    });
  });
});

describe("Analytics Dashboard organization projection", () => {
  it("切替前登録の2店舗目では最初に観測した確定日を初回確定として公開しない", () => {
    const organization = {
      organizationId: "organizations:1",
      displayName: "グループ",
      registeredAt: 1,
      secondShopAt: 2,
      secondShopFirstConfirmedAt: 4,
      updatedAt: 4,
    } as unknown as Doc<"analyticsOrganizations">;

    expect(toOrganizationRowDto(organization, null, 3).secondShopFirstConfirmedAt).toBeNull();
    expect(toOrganizationRowDto(organization, null, 2).secondShopFirstConfirmedAt).toBe(4);
  });

  it("canonical planをそのまま投影する", () => {
    const standard = {
      organizationId: "organizations:1",
      displayName: "Standard組織",
      registeredAt: 1,
      currentPlan: "standard",
      updatedAt: 4,
    } as unknown as Doc<"analyticsOrganizations">;
    const pro = { ...standard, currentPlan: "pro" } as unknown as Doc<"analyticsOrganizations">;

    expect(toOrganizationRowDto(standard, null, 1).currentPlan).toBe("standard");
    expect(toOrganizationRowDto(pro, null, 1).currentPlan).toBe("pro");
  });

  it("reset前のlegacy materialized planをresponseへ流さない", () => {
    const organization = {
      organizationId: "organizations:1",
      displayName: "旧組織",
      registeredAt: 1,
      currentPlan: "business",
      updatedAt: 4,
    } as unknown as Doc<"analyticsOrganizations">;

    expect(() => toOrganizationRowDto(organization, null, 1)).toThrow("analytics_plan_projection_not_canonical");
  });
});

describe("Analytics Dashboard shop usage likelihood", () => {
  const cutoffAt = Date.UTC(2026, 7, 12);
  const activityWindowStartAt = cutoffAt - ANALYTICS_POLICY.health.activityWindowDays * DAY_MS;
  const emptyKpis = {
    nextCyclePeriodStart: null,
    shiftTargetCount: 0,
    staffMembershipCount: 0,
  };

  it("最近の活動または次回シフトがあれば可能性が高い", () => {
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: cutoffAt - 1, kpis: null })).toEqual({
      usageLikelihood: "high",
      usageReasons: ["recentActivity"],
    });
    expect(
      classifyShopUsage({
        cutoffAt,
        latestActivityAt: null,
        kpis: { ...emptyKpis, nextCyclePeriodStart: "2026-08-20" },
      }),
    ).toEqual({ usageLikelihood: "high", usageReasons: ["hasUpcomingCycle"] });
  });

  it("古い活動、シフト対象者、スタッフ所属は可能性ありにする", () => {
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: activityWindowStartAt - 1, kpis: emptyKpis })).toEqual({
      usageLikelihood: "possible",
      usageReasons: ["observedActivity"],
    });
    expect(
      classifyShopUsage({
        cutoffAt,
        latestActivityAt: null,
        kpis: { ...emptyKpis, shiftTargetCount: 1 },
      }),
    ).toEqual({ usageLikelihood: "possible", usageReasons: ["hasShiftTargets"] });
    expect(
      classifyShopUsage({
        cutoffAt,
        latestActivityAt: null,
        kpis: { ...emptyKpis, staffMembershipCount: 1 },
      }),
    ).toEqual({ usageLikelihood: "possible", usageReasons: ["hasStaffMemberships"] });
  });

  it("活動も最新KPIの肯定材料もなければ状態不明にする", () => {
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: null, kpis: null })).toEqual({
      usageLikelihood: "unknown",
      usageReasons: [],
    });
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: null, kpis: emptyKpis })).toEqual({
      usageLikelihood: "unknown",
      usageReasons: [],
    });
  });

  it("活動窓の開始を含み、開始直前は古い活動、cutoff以後は未公開として除外する", () => {
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: activityWindowStartAt, kpis: emptyKpis })).toEqual({
      usageLikelihood: "high",
      usageReasons: ["recentActivity"],
    });
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: activityWindowStartAt - 1, kpis: emptyKpis })).toEqual({
      usageLikelihood: "possible",
      usageReasons: ["observedActivity"],
    });
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: cutoffAt, kpis: emptyKpis })).toEqual({
      usageLikelihood: "unknown",
      usageReasons: [],
    });
    expect(classifyShopUsage({ cutoffAt, latestActivityAt: cutoffAt + 1, kpis: emptyKpis })).toEqual({
      usageLikelihood: "unknown",
      usageReasons: [],
    });
  });

  it("highを優先し、重複しない根拠を固定順ですべて返す", () => {
    expect(
      classifyShopUsage({
        cutoffAt,
        latestActivityAt: cutoffAt - 1,
        kpis: {
          nextCyclePeriodStart: "2026-08-20",
          shiftTargetCount: 2,
          staffMembershipCount: 3,
        },
      }),
    ).toEqual({
      usageLikelihood: "high",
      usageReasons: ["recentActivity", "hasUpcomingCycle", "hasShiftTargets", "hasStaffMemberships"],
    });
    expect(
      classifyShopUsage({
        cutoffAt,
        latestActivityAt: activityWindowStartAt - 1,
        kpis: {
          nextCyclePeriodStart: "2026-08-20",
          shiftTargetCount: 2,
          staffMembershipCount: 3,
        },
      }),
    ).toEqual({
      usageLikelihood: "high",
      usageReasons: ["hasUpcomingCycle", "observedActivity", "hasShiftTargets", "hasStaffMemberships"],
    });
  });

  it("candidateは可能性が高い店舗と可能性ありの店舗だけに一致する", () => {
    const likelihoods: AnalyticsShopUsageLikelihood[] = ["high", "possible", "unknown"];

    expect(likelihoods.filter((value) => usageMatches(value, "candidate"))).toEqual(["high", "possible"]);
    expect(usageMatches("unknown", null)).toBe(true);
    expect(usageMatches("possible", "possible")).toBe(true);
    expect(usageMatches("possible", "high")).toBe(false);
  });
});

describe("Analytics Dashboard overview range availability", () => {
  const completeRange = {
    effectiveFrom: "2026-05-05",
    effectiveTo: "2026-05-07",
    latestCompleteRun: null,
    missingDates: [],
    retentionStartDate: null,
    runIdsByDate: new Map(),
  } satisfies AnalyticsRunRange;
  const state = {
    dataStartDate: "2026-05-05",
    latestCompleteSnapshotDate: "2026-05-07",
  };

  it("蓄積開始前を含む要求をclampした部分集合ではavailableにしない", () => {
    expect(hasCompleteRequestedRange(state, { from: "2026-05-04", to: "2026-05-07" }, completeRange)).toBe(false);
  });

  it("最新complete日より後を含む要求をclampした部分集合ではavailableにしない", () => {
    expect(hasCompleteRequestedRange(state, { from: "2026-05-05", to: "2026-05-08" }, completeRange)).toBe(false);
  });

  it("要求範囲全体がcompleteならavailableにできる", () => {
    expect(hasCompleteRequestedRange(state, { from: "2026-05-05", to: "2026-05-07" }, completeRange)).toBe(true);
  });
});
