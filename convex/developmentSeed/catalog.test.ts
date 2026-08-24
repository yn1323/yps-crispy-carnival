import { describe, expect, it } from "vitest";
import schema from "../schema";
import {
  buildDevelopmentSeedRecruitmentWindows,
  DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  DEVELOPMENT_SEED_CONTRACT_VERSION,
  DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT,
  DEVELOPMENT_SEED_SCENARIO_KEYS,
  DEVELOPMENT_SEED_SCENARIOS,
  DEVELOPMENT_SEED_TABLE_COVERAGE,
  DEVELOPMENT_SEED_UNION_COVERAGE,
} from "./catalog";

describe("development seed catalog", () => {
  it("schemaの全66 tableを理由付きで完全分類する", () => {
    expect(Object.keys(DEVELOPMENT_SEED_TABLE_COVERAGE).sort()).toEqual(Object.keys(schema.tables).sort());
    expect(Object.keys(schema.tables)).toHaveLength(DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT);
    expect(DEVELOPMENT_SEED_TABLE_COVERAGE.notificationResendDelayedFailureDeadlines).toMatchObject({
      kind: "intentionallyEmpty",
    });
    expect(DEVELOPMENT_SEED_TABLE_COVERAGE.organizationStaffOrderEntries).toEqual({
      kind: "seeded",
      scenarioKeys: ["standard-operations"],
    });
  });

  it("CLIとdeployment backendを削除前に照合する固定契約を持つ", () => {
    expect(DEVELOPMENT_SEED_CONTRACT_VERSION).toBe("development-seed-v2");
    expect(DEVELOPMENT_SEED_CONTRACT_FINGERPRINT).toBe("161fbc73");
    expect(DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT).toBe(66);
  });

  it("固定9 scenarioを重複なく持つ", () => {
    expect(DEVELOPMENT_SEED_SCENARIO_KEYS).toEqual([
      "free-capacity",
      "trial-ending",
      "standard-operations",
      "pro-notifications",
      "standard-scheduled-change",
      "payment-pending",
      "payment-grace",
      "payment-restricted",
      "policy-restricted",
    ]);
    expect(new Set(DEVELOPMENT_SEED_SCENARIO_KEYS).size).toBe(9);
  });

  it("Standard解約予約とStandard上限超過をcanonical billing stateで表す", () => {
    const now = Date.parse("2026-08-20T00:00:00.000Z");
    const scheduled = DEVELOPMENT_SEED_SCENARIOS.find((scenario) => scenario.key === "standard-scheduled-change");
    const overLimit = DEVELOPMENT_SEED_SCENARIOS.find((scenario) => scenario.key === "policy-restricted");

    expect(scheduled?.billingState(now)).toEqual({
      kind: "scheduledChange",
      planIdVersion: 2,
      currentPlan: "standard",
      targetPlan: "free",
      effectiveAt: now + 14 * 24 * 60 * 60 * 1000,
      restrictAtPeriodEnd: true,
    });
    expect(overLimit?.billingState()).toEqual({ kind: "active", planIdVersion: 2, plan: "standard" });
  });

  it("主要unionの全値をseedまたは理由付き対象外へ分類する", () => {
    expect(Object.keys(DEVELOPMENT_SEED_UNION_COVERAGE.submissionKind).sort()).toEqual([
      "dateOnly",
      "shiftType",
      "time",
    ]);
    expect(Object.keys(DEVELOPMENT_SEED_UNION_COVERAGE.billingKind).sort()).toEqual([
      "active",
      "complimentary",
      "grace",
      "initialPaymentPending",
      "pendingActivation",
      "restricted",
      "scheduledChange",
      "trial",
    ]);
    expect(Object.keys(DEVELOPMENT_SEED_UNION_COVERAGE.outboxStatus).sort()).toEqual([
      "cancelled",
      "failed",
      "pending",
      "processing",
      "sent",
    ]);
  });

  it.each([
    ["2026-12-30", "2027-01-19"],
    ["2028-02-28", "2028-03-19"],
    ["2028-02-29", "2028-03-20"],
  ])("%sを基準に月末・年末・うるう日を越えてJST相対日付を作る", (today, futureEnd) => {
    const windows = buildDevelopmentSeedRecruitmentWindows(today);

    expect(windows.futureConfirmed.periodEnd).toBe(futureEnd);
    for (const window of Object.values(windows)) {
      expect(window.deadline < window.periodStart).toBe(true);
      expect(window.periodStart <= window.periodEnd).toBe(true);
    }
  });

  it("現在確定・要対応・募集中・未来・過去の判定境界を毎回維持する", () => {
    const today = "2026-08-20";
    const windows = buildDevelopmentSeedRecruitmentWindows(today);

    expect(windows.currentConfirmed.periodStart <= today && windows.currentConfirmed.periodEnd >= today).toBe(true);
    expect(windows.actionRequired.deadline < today && windows.actionRequired.periodEnd >= today).toBe(true);
    expect(windows.recruiting.deadline >= today && windows.recruiting.periodEnd >= today).toBe(true);
    expect(windows.futureConfirmed.periodStart > today).toBe(true);
    expect(windows.pastConfirmed.periodEnd < today).toBe(true);
  });
});
