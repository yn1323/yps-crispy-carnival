import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import {
  type AnalyticsRunRange,
  hasCompleteRequestedRange,
  toOrganizationRowDto,
  toShopKpiDto,
  toShopRowDto,
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
