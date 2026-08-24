import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORGANIZATION_PLAN_LIMITS } from "./planLimits";
import {
  calculateTrialEndsAt,
  createPaymentGraceState,
  decideScheduledTransition,
  deriveOrganizationAccessPolicy,
  deriveOrganizationBillingPolicy,
  evaluateFreeEligibility,
  evaluateOrganizationUsageLimits,
  evaluatePlanLimits,
  getOrganizationBillingStateDeadline,
  isVerifiedBillingTransitionAllowed,
  normalizeOrganizationBillingState,
  type OrganizationBillingState,
  type OrganizationPersonUsageInput,
  PAYMENT_GRACE_PERIOD_MS,
  projectFreeUsage,
  projectOrganizationUsage,
  RESTRICTED_RECOVERY_CAPABILITIES,
  resolveUsageLimitPlan,
} from "./policy";

describe("organizationBilling/policy plan limits", () => {
  it("Trial、Free、Standard、Proの人数・店舗・管理者上限を定義する", () => {
    expect(ORGANIZATION_PLAN_LIMITS).toEqual({
      trial: { maxPeople: 50, maxActiveShops: 5, maxActiveManagers: 5 },
      free: { maxPeople: 5, maxActiveShops: 1, maxActiveManagers: 2 },
      standard: { maxPeople: 25, maxActiveShops: 5, maxActiveManagers: 5 },
      pro: { maxPeople: 50, maxActiveShops: 5, maxActiveManagers: 5 },
    });
  });

  it("各プランの上限内と超過項目を判定する", () => {
    expect(evaluatePlanLimits("free", { peopleCount: 5, activeShopCount: 1, activeManagerCount: 1 })).toMatchObject({
      withinLimits: true,
      violations: [],
    });
    expect(
      evaluatePlanLimits("standard", { peopleCount: 25, activeShopCount: 5, activeManagerCount: 5 }),
    ).toMatchObject({
      withinLimits: true,
      violations: [],
    });
    expect(
      evaluatePlanLimits("standard", { peopleCount: 26, activeShopCount: 6, activeManagerCount: 6 }),
    ).toMatchObject({
      withinLimits: false,
      violations: ["people", "activeShops", "activeManagers"],
    });
    expect(evaluatePlanLimits("pro", { peopleCount: 50, activeShopCount: 5, activeManagerCount: 5 })).toMatchObject({
      withinLimits: true,
    });
    expect(evaluatePlanLimits("pro", { peopleCount: 51, activeShopCount: 5, activeManagerCount: 5 })).toMatchObject({
      withinLimits: false,
      violations: ["people"],
    });
    expect(evaluatePlanLimits("trial", { peopleCount: 51, activeShopCount: 5, activeManagerCount: 6 })).toMatchObject({
      withinLimits: false,
      violations: ["people", "activeManagers"],
    });
  });

  it("normalizes persisted Business variants to the canonical Pro model", () => {
    expect(normalizeOrganizationBillingState({ kind: "active", plan: "business" })).toEqual({
      kind: "active",
      plan: "pro",
    });
    expect(
      normalizeOrganizationBillingState({
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: 200,
      }),
    ).toEqual({ kind: "active", plan: "pro" });
  });
});

describe("organizationBilling/policy usage limit plan", () => {
  it.each<{ name: string; state: OrganizationBillingState; expected: "free" | "standard" | "pro" | null }>([
    {
      name: "Trial",
      state: { kind: "trial", trialEndsAt: 100 },
      expected: "pro",
    },
    {
      name: "初回請求結果待ち",
      state: { kind: "initialPaymentPending", plan: "business", startedAt: 10 },
      expected: "standard",
    },
    {
      name: "Freeからの有効化待ち",
      state: { kind: "pendingActivation", plan: "business", fallback: "free", startedAt: 10 },
      expected: "free",
    },
    {
      name: "Proからの有効化待ち",
      state: { kind: "pendingActivation", plan: "business", fallback: "pro", startedAt: 10 },
      expected: "standard",
    },
    {
      name: "legacy契約制限からの有効化待ち",
      state: {
        kind: "pendingActivation",
        plan: "business",
        fallback: "restricted",
        restrictedFallbackState: {
          kind: "restricted",
          reason: "planLimitExceeded",
          limitPlan: "pro",
          recoveryManagerPersonIds: [],
          previousActiveShopIds: [],
          restrictedAt: 5,
        },
        startedAt: 10,
      },
      expected: "standard",
    },
    {
      name: "fallback詳細がないlegacy契約制限からの有効化待ち",
      state: { kind: "pendingActivation", plan: "pro", fallback: "restricted", startedAt: 10 },
      expected: null,
    },
    {
      name: "Active Free",
      state: { kind: "active", plan: "free" },
      expected: "free",
    },
    {
      name: "Active Pro",
      state: { kind: "active", plan: "pro" },
      expected: "standard",
    },
    {
      name: "Active Business",
      state: { kind: "active", plan: "business" },
      expected: "pro",
    },
    {
      name: "無償Business",
      state: { kind: "complimentary", plan: "business" },
      expected: "pro",
    },
    {
      name: "BusinessからProへの変更予定",
      state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt: 20 },
      expected: "pro",
    },
    {
      name: "ProからFreeへの変更予定",
      state: { kind: "scheduledChange", currentPlan: "pro", targetPlan: "free", effectiveAt: 20 },
      expected: "standard",
    },
    {
      name: "支払い猶予中",
      state: { kind: "grace", plan: "pro", targetPlan: "business", startedAt: 10, endsAt: 20 },
      expected: "standard",
    },
    {
      name: "limitPlanを持つlegacy契約制限",
      state: {
        kind: "restricted",
        reason: "planLimitExceeded",
        limitPlan: "free",
        recoveryManagerPersonIds: [],
        previousActiveShopIds: [],
        restrictedAt: 10,
      },
      expected: "free",
    },
    {
      name: "reasonだけが残るlegacy Free契約制限",
      state: {
        kind: "restricted",
        reason: "freeConditionsNotMet",
        recoveryManagerPersonIds: [],
        previousActiveShopIds: [],
        restrictedAt: 10,
      },
      expected: "free",
    },
    {
      name: "適用プランを確定できないlegacy契約制限",
      state: {
        kind: "restricted",
        reason: "paymentGraceExpired",
        previousPlan: "business",
        recoveryManagerPersonIds: [],
        previousActiveShopIds: [],
        restrictedAt: 10,
      },
      expected: null,
    },
  ])("$nameの利用上限プランを$expectedとして解決する", ({ state, expected }) => {
    expect(resolveUsageLimitPlan(state)).toBe(expected);
  });
});

describe("organizationBilling/policy usage limit status", () => {
  it("上限ちょうどは利用数・上限とともに上限内として返す", () => {
    const usage = { peopleCount: 5, activeShopCount: 1, activeManagerCount: 2 };

    expect(evaluateOrganizationUsageLimits({ plan: "free", usage })).toEqual({
      kind: "withinLimits",
      evaluatedPlan: "free",
      usage,
      limits: ORGANIZATION_PLAN_LIMITS.free,
    });
  });

  it("複数の超過をkind・現在値・上限・超過数で正確に返す", () => {
    const usage = { peopleCount: 28, activeShopCount: 7, activeManagerCount: 8 };

    expect(evaluateOrganizationUsageLimits({ plan: "standard", usage })).toEqual({
      kind: "overLimit",
      evaluatedPlan: "standard",
      usage,
      limits: ORGANIZATION_PLAN_LIMITS.standard,
      violations: [
        { kind: "people", current: 28, max: 25, excess: 3 },
        { kind: "activeShops", current: 7, max: 5, excess: 2 },
        { kind: "activeManagers", current: 8, max: 5, excess: 3 },
      ],
    });
  });
});

describe("organizationBilling/policy access policy", () => {
  it("課金利用可能かつ上限内なら通常利用にする", () => {
    const billingPolicy = deriveOrganizationBillingPolicy({ kind: "active", plan: "free" });
    const usageLimitStatus = evaluateOrganizationUsageLimits({
      plan: "free",
      usage: { peopleCount: 5, activeShopCount: 1, activeManagerCount: 2 },
    });

    expect(deriveOrganizationAccessPolicy({ billingPolicy, usageLimitStatus })).toEqual({
      billingPolicy,
      usageLimitStatus,
      accessMode: "normal",
      canWriteBusinessData: true,
      businessWriteBlockReason: null,
    });
  });

  it("課金利用可能でも上限超過なら整理操作専用にする", () => {
    const billingPolicy = deriveOrganizationBillingPolicy({ kind: "active", plan: "pro" });
    const usageLimitStatus = evaluateOrganizationUsageLimits({
      plan: "standard",
      usage: { peopleCount: 26, activeShopCount: 5, activeManagerCount: 5 },
    });

    expect(deriveOrganizationAccessPolicy({ billingPolicy, usageLimitStatus })).toEqual({
      billingPolicy,
      usageLimitStatus,
      accessMode: "limitRecoveryOnly",
      canWriteBusinessData: false,
      businessWriteBlockReason: "usageLimitExceeded",
    });
  });

  it("boundedな利用数判定が確定できない場合もfail closedで整理操作専用にする", () => {
    const billingPolicy = deriveOrganizationBillingPolicy({ kind: "active", plan: "free" });
    const usageLimitStatus = {
      kind: "unknown" as const,
      evaluatedPlan: "free" as const,
      observedUsage: { peopleCount: 1, activeShopCount: 1, activeManagerCount: 1 },
      limits: ORGANIZATION_PLAN_LIMITS.free,
      unknownDimensions: ["people" as const],
      knownViolations: [],
    };

    expect(deriveOrganizationAccessPolicy({ billingPolicy, usageLimitStatus })).toEqual({
      billingPolicy,
      usageLimitStatus,
      accessMode: "limitRecoveryOnly",
      canWriteBusinessData: false,
      businessWriteBlockReason: "usageLimitExceeded",
    });
  });

  it("課金制限と上限超過が重なれば既存の課金復旧制限を優先する", () => {
    const billingPolicy = deriveOrganizationBillingPolicy({
      kind: "restricted",
      reason: "planLimitExceeded",
      limitPlan: "free",
      recoveryManagerPersonIds: [],
      previousActiveShopIds: [],
      restrictedAt: 10,
    });
    const usageLimitStatus = evaluateOrganizationUsageLimits({
      plan: "free",
      usage: { peopleCount: 6, activeShopCount: 2, activeManagerCount: 3 },
    });

    expect(deriveOrganizationAccessPolicy({ billingPolicy, usageLimitStatus })).toEqual({
      billingPolicy,
      usageLimitStatus,
      accessMode: "billingRecoveryOnly",
      canWriteBusinessData: false,
      businessWriteBlockReason: "restricted",
    });
  });
});

describe("organizationBilling/policy usage projection", () => {
  const people: OrganizationPersonUsageInput[] = [
    {
      personId: "manager-and-staff",
      isActiveInOrganization: true,
      isStaff: false,
      managerRole: "active",
    },
    // 同じ人物が別店舗でスタッフでも、一人として数える。
    {
      personId: "manager-and-staff",
      isActiveInOrganization: true,
      isStaff: true,
      managerRole: "none",
    },
    { personId: "manager-only", isActiveInOrganization: true, isStaff: false, managerRole: "active" },
    { personId: "read-only-only", isActiveInOrganization: true, isStaff: false, managerRole: "readOnly" },
    { personId: "read-only-staff", isActiveInOrganization: true, isStaff: true, managerRole: "readOnly" },
    { personId: "staff-without-shop", isActiveInOrganization: true, isStaff: true, managerRole: "none" },
    { personId: "removed", isActiveInOrganization: false, isStaff: true, managerRole: "active" },
  ];

  it("人物単位で重複排除し、閲覧のみ管理者と削除済み人物を算入規則どおり扱う", () => {
    expect(projectOrganizationUsage({ people, reservedPersonCount: 1 })).toEqual({
      currentPeopleCount: 4,
      activeManagerCount: 2,
      reservedPersonCount: 1,
      projectedPeopleCount: 5,
    });
  });

  it("Free移行では選択外の純粋管理者だけを除外し、スタッフ兼務者は数え続ける", () => {
    expect(projectFreeUsage(people, "manager-only")).toEqual({
      currentPeopleCount: 4,
      projectedPeopleCount: 4,
      projectedActiveManagerCount: 1,
      selectedManagerIsActive: true,
    });
  });

  it("選択した人物が有効管理者でなければFreeの管理者を成立させない", () => {
    expect(projectFreeUsage(people, "read-only-staff")).toEqual({
      currentPeopleCount: 4,
      projectedPeopleCount: 3,
      projectedActiveManagerCount: 0,
      selectedManagerIsActive: false,
    });
  });
});

describe("organizationBilling/policy capabilities", () => {
  it("Trialとlegacy有料プランはcanonical権限へ解決して有料機能を許可する", () => {
    const trial = deriveOrganizationBillingPolicy({ kind: "trial", trialEndsAt: 100 });
    const pro = deriveOrganizationBillingPolicy({ kind: "active", plan: "pro" });
    const business = deriveOrganizationBillingPolicy({ kind: "active", plan: "business" });

    expect(trial).toMatchObject({
      paidPlan: null,
      entitlementPlan: "pro",
      displayPlan: "trial",
      targetingPlan: "trial",
      limits: ORGANIZATION_PLAN_LIMITS.pro,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
      deadlineAt: 100,
    });
    expect(pro).toMatchObject({
      paidPlan: "standard",
      entitlementPlan: "standard",
      displayPlan: "standard",
      targetingPlan: "standard",
      limits: ORGANIZATION_PLAN_LIMITS.standard,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
    });
    expect(business).toMatchObject({
      paidPlan: "pro",
      entitlementPlan: "pro",
      displayPlan: "pro",
      targetingPlan: "pro",
      limits: ORGANIZATION_PLAN_LIMITS.pro,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
    });
  });

  it("legacy無償Businessはcanonical Proの50人上限と有料機能を期限なしで利用できる", () => {
    const state = { kind: "complimentary", plan: "business" } as const;

    expect(deriveOrganizationBillingPolicy(state)).toEqual({
      paidPlan: null,
      entitlementPlan: "pro",
      displayPlan: "pro",
      targetingPlan: "pro",
      limits: { maxPeople: 50, maxActiveShops: 5, maxActiveManagers: 5 },
      canReadExistingData: true,
      canWriteBusinessData: true,
      businessWriteBlockReason: null,
      canManageManagers: true,
      canUsePaidFeatures: true,
      paidFeatureBlockReason: null,
      allowedRecoveryCapabilities: [],
      deadlineAt: null,
    });
    expect(getOrganizationBillingStateDeadline(state)).toBeNull();
  });

  it("Freeは基本業務を書き込めるが有料機能を許可しない", () => {
    expect(deriveOrganizationBillingPolicy({ kind: "active", plan: "free" })).toMatchObject({
      entitlementPlan: "free",
      limits: ORGANIZATION_PLAN_LIMITS.free,
      canWriteBusinessData: true,
      businessWriteBlockReason: null,
      canManageManagers: true,
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "freePlan",
    });
  });

  it("初回請求処理中は選択先にかかわらずPro相当の上限と機能を継続する", () => {
    expect(
      deriveOrganizationBillingPolicy({ kind: "initialPaymentPending", plan: "pro", startedAt: 10 }),
    ).toMatchObject({
      entitlementPlan: "standard",
      limits: ORGANIZATION_PLAN_LIMITS.standard,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
    });
    expect(
      deriveOrganizationBillingPolicy({ kind: "initialPaymentPending", plan: "business", startedAt: 10 }),
    ).toMatchObject({
      paidPlan: "pro",
      entitlementPlan: "standard",
      displayPlan: "pro",
      limits: ORGANIZATION_PLAN_LIMITS.standard,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
    });
  });

  it("Freeからの契約開始結果待ちはFreeの基本業務を維持し、有料機能だけを開放しない", () => {
    expect(
      deriveOrganizationBillingPolicy({
        kind: "pendingActivation",
        plan: "pro",
        fallback: "free",
        startedAt: 10,
      }),
    ).toMatchObject({
      entitlementPlan: "free",
      limits: ORGANIZATION_PLAN_LIMITS.free,
      canWriteBusinessData: true,
      businessWriteBlockReason: null,
      canManageManagers: true,
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "paymentResultPending",
      allowedRecoveryCapabilities: [],
    });
  });

  it("契約制限中からの契約開始結果待ちは制限理由と復旧権限を維持する", () => {
    expect(
      deriveOrganizationBillingPolicy({
        kind: "pendingActivation",
        plan: "pro",
        fallback: "restricted",
        startedAt: 10,
      }),
    ).toMatchObject({
      entitlementPlan: null,
      canWriteBusinessData: false,
      businessWriteBlockReason: "restricted",
      canManageManagers: false,
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "restricted",
      allowedRecoveryCapabilities: RESTRICTED_RECOVERY_CAPABILITIES,
    });
  });

  it("FreeまたはStandardへの変更予定は期日まで現在の有料プランを維持する", () => {
    expect(
      deriveOrganizationBillingPolicy({
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "free",
        effectiveAt: 100,
      }),
    ).toMatchObject({
      entitlementPlan: "standard",
      limits: ORGANIZATION_PLAN_LIMITS.standard,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
      deadlineAt: 100,
    });
    expect(
      deriveOrganizationBillingPolicy({
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: 200,
      }),
    ).toMatchObject({
      entitlementPlan: "pro",
      limits: ORGANIZATION_PLAN_LIMITS.pro,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
      deadlineAt: 200,
    });
  });

  it("支払い猶予中は期限まで元の有料プランを維持する", () => {
    expect(deriveOrganizationBillingPolicy({ kind: "grace", plan: "pro", startedAt: 10, endsAt: 20 })).toMatchObject({
      entitlementPlan: "standard",
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
      deadlineAt: 20,
    });
  });

  it("契約制限中は閲覧と仕様で定めた復旧操作だけを許可する", () => {
    expect(
      deriveOrganizationBillingPolicy({
        kind: "restricted",
        reason: "paymentGraceExpired",
        previousPlan: "pro",
        recoveryManagerPersonIds: [],
        previousActiveShopIds: [],
        restrictedAt: 30,
      }),
    ).toMatchObject({
      canReadExistingData: true,
      canWriteBusinessData: false,
      businessWriteBlockReason: "restricted",
      canManageManagers: false,
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "restricted",
      allowedRecoveryCapabilities: RESTRICTED_RECOVERY_CAPABILITIES,
    });
  });
});

describe("organizationBilling/policy Free eligibility", () => {
  it("有効管理者1〜2名、稼働店舗1件以下、利用人数5名以下で成立する", () => {
    expect(evaluateFreeEligibility({ peopleCount: 5, activeShopCount: 1, activeManagerCount: 1 })).toEqual({
      eligible: true,
      failures: [],
    });
    expect(evaluateFreeEligibility({ peopleCount: 1, activeShopCount: 0, activeManagerCount: 1 })).toEqual({
      eligible: true,
      failures: [],
    });
    expect(evaluateFreeEligibility({ peopleCount: 5, activeShopCount: 1, activeManagerCount: 2 })).toEqual({
      eligible: true,
      failures: [],
    });
  });

  it("管理者未確定、管理者3名、複数店舗、人数超過を区別する", () => {
    expect(evaluateFreeEligibility({ peopleCount: 6, activeShopCount: 2, activeManagerCount: 0 })).toEqual({
      eligible: false,
      failures: ["activeManagerCount", "activeShopCount", "peopleCount"],
    });
    expect(evaluateFreeEligibility({ peopleCount: 3, activeShopCount: 1, activeManagerCount: 3 })).toEqual({
      eligible: false,
      failures: ["activeManagerCount"],
    });
  });
});

describe("organizationBilling/policy trial deadline", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_CLOUD_URL", "");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("JSTの事業者作成日から3か月後の同日00:00を返す", () => {
    const createdAt = Date.parse("2026-07-14T01:30:00.000Z");
    expect(calculateTrialEndsAt(createdAt)).toBe(Date.parse("2026-10-13T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-07-14T14:59:59.000Z"))).toBe(Date.parse("2026-10-13T15:00:00.000Z"));
  });

  it("UTCでは前日になるJSTの日付境界を正しく扱う", () => {
    expect(calculateTrialEndsAt(Date.parse("2026-06-30T14:59:59.000Z"))).toBe(Date.parse("2026-09-29T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-06-30T15:00:00.000Z"))).toBe(Date.parse("2026-09-30T15:00:00.000Z"));
  });

  it("非うるう年の2月に同じ日がなければ月末へ丸める", () => {
    expect(calculateTrialEndsAt(Date.parse("2026-11-30T14:59:59.000Z"))).toBe(Date.parse("2027-02-27T15:00:00.000Z"));
  });

  it("閏年の2月末へ丸める", () => {
    expect(calculateTrialEndsAt(Date.parse("2027-11-30T14:59:59.000Z"))).toBe(Date.parse("2028-02-28T15:00:00.000Z"));
  });

  it.each([
    {
      currentDeploymentUrl: "",
      debugDeploymentUrl: "https://trial-debug.convex.cloud",
      durationDays: "1",
    },
    {
      currentDeploymentUrl: "https://trial-debug.convex.cloud",
      debugDeploymentUrl: "",
      durationDays: "1",
    },
    {
      currentDeploymentUrl: "https://trial-debug.convex.cloud",
      debugDeploymentUrl: "https://another.convex.cloud",
      durationDays: "1",
    },
    {
      currentDeploymentUrl: "https://trial-debug.convex.cloud",
      debugDeploymentUrl: "https://trial-debug.convex.cloud",
      durationDays: "   ",
    },
  ])(
    "対象URLまたは日数が有効でなければ3か月を維持する: current=$currentDeploymentUrl, debug=$debugDeploymentUrl, days=$durationDays",
    ({ currentDeploymentUrl, debugDeploymentUrl, durationDays }) => {
      vi.stubEnv("CONVEX_CLOUD_URL", currentDeploymentUrl);
      vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", debugDeploymentUrl);
      vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", durationDays);

      expect(calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toBe(Date.parse("2026-10-13T15:00:00.000Z"));
    },
  );

  it("対象deploymentが一致しなければ不正な日数も無視して3か月を維持する", () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://current.convex.cloud");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", "https://another.convex.cloud");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "not-an-integer");

    expect(calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toBe(Date.parse("2026-10-13T15:00:00.000Z"));
  });

  it("対象URLを正規化し、1日を登録日の翌日00:00 JSTとして扱う", () => {
    vi.stubEnv("CONVEX_CLOUD_URL", " https://trial-debug.convex.cloud/ ");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", " https://trial-debug.convex.cloud/// ");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", " 1 ");

    expect(calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toBe(Date.parse("2026-07-14T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-07-14T14:59:59.000Z"))).toBe(Date.parse("2026-07-14T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-07-14T15:00:00.000Z"))).toBe(Date.parse("2026-07-15T15:00:00.000Z"));
  });

  it("範囲内の中間値をJST暦日として計算する", () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://trial-debug.convex.cloud");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", "https://trial-debug.convex.cloud");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "7");

    expect(calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toBe(Date.parse("2026-07-20T15:00:00.000Z"));
  });

  it("30日を月・年をまたぐJST暦日として計算する", () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://trial-debug.convex.cloud");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", "https://trial-debug.convex.cloud");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "30");

    expect(calculateTrialEndsAt(Date.parse("2026-12-15T03:00:00.000Z"))).toBe(Date.parse("2027-01-13T15:00:00.000Z"));
  });

  it.each(["0", "-1", "1.5", "1e1", "01", "31", "abc", "9007199254740992"])(
    "対象deploymentの不正な日数 %s を拒否する",
    (value) => {
      vi.stubEnv("CONVEX_CLOUD_URL", "https://trial-debug.convex.cloud");
      vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", "https://trial-debug.convex.cloud");
      vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", value);

      expect(() => calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toThrowError(RangeError);
    },
  );
});

describe("organizationBilling/policy payment grace", () => {
  it("最初の支払い失敗時刻から正確に14日後を猶予期限にする", () => {
    const firstFailureAt = Date.parse("2026-10-01T03:45:00.000Z");

    expect(createPaymentGraceState("pro", firstFailureAt)).toEqual({
      kind: "grace",
      planIdVersion: 2,
      plan: "pro",
      startedAt: firstFailureAt,
      endsAt: firstFailureAt + PAYMENT_GRACE_PERIOD_MS,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    "不正な最初の失敗時刻 %s を拒否する",
    (value) => {
      expect(() => createPaymentGraceState("pro", value)).toThrow(RangeError);
    },
  );
});

describe("organizationBilling/policy verified transition", () => {
  it("無償Businessを検証済み課金結果から作成または別状態へ変更できない", () => {
    const complimentary = { kind: "complimentary", plan: "business" } as const;
    const destinations: OrganizationBillingState[] = [
      { kind: "trial", trialEndsAt: 100 },
      { kind: "initialPaymentPending", plan: "business", startedAt: 100 },
      { kind: "pendingActivation", plan: "business", fallback: "free", startedAt: 100 },
      { kind: "active", plan: "business" },
      { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt: 200 },
      { kind: "grace", plan: "business", startedAt: 100, endsAt: 200 },
      {
        kind: "restricted",
        reason: "unexpectedCancellation",
        previousPlan: "business",
        recoveryManagerPersonIds: [],
        previousActiveShopIds: [],
        restrictedAt: 100,
      },
      complimentary,
    ];

    for (const destination of destinations) {
      expect(isVerifiedBillingTransitionAllowed(complimentary, destination)).toBe(false);
    }
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "business" }, complimentary)).toBe(false);
  });

  it("支払い失敗は有効な有料契約または初回請求処理中からだけ猶予へ移せる", () => {
    const grace = createPaymentGraceState("pro", 100);
    const initialPaymentGrace = createPaymentGraceState("standard", 100, "pro");

    expect(isVerifiedBillingTransitionAllowed({ kind: "active", planIdVersion: 2, plan: "pro" }, grace)).toBe(true);
    expect(
      isVerifiedBillingTransitionAllowed(
        { kind: "initialPaymentPending", planIdVersion: 2, plan: "pro", startedAt: 50 },
        initialPaymentGrace,
      ),
    ).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "free" }, grace)).toBe(false);
    expect(
      isVerifiedBillingTransitionAllowed(
        {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [],
          previousActiveShopIds: [],
          restrictedAt: 50,
        },
        grace,
      ),
    ).toBe(false);
  });

  it("プラン変更予約は有効な有料契約からFree、またはBusinessからProだけを許可する", () => {
    const businessToPro = {
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: 200,
    } as const;

    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "business" }, businessToPro)).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "trial", trialEndsAt: 100 }, businessToPro)).toBe(false);
    expect(
      isVerifiedBillingTransitionAllowed(
        { kind: "active", plan: "pro" },
        { kind: "scheduledChange", currentPlan: "pro", targetPlan: "free", effectiveAt: 200 },
      ),
    ).toBe(true);
  });

  it("期間末変更は明示した取消eventだけが現在プランへ戻せる", () => {
    const proToFree = {
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      effectiveAt: 200,
    } as const;
    const businessToPro = {
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: 200,
    } as const;

    expect(isVerifiedBillingTransitionAllowed(proToFree, { kind: "active", plan: "pro" })).toBe(false);
    expect(
      isVerifiedBillingTransitionAllowed(proToFree, { kind: "active", plan: "pro" }, "scheduledChangeCanceled"),
    ).toBe(true);
    expect(
      isVerifiedBillingTransitionAllowed(proToFree, { kind: "active", plan: "business" }, "scheduledChangeCanceled"),
    ).toBe(false);
    expect(
      isVerifiedBillingTransitionAllowed(
        businessToPro,
        { kind: "active", plan: "business" },
        "scheduledChangeCanceled",
      ),
    ).toBe(true);
    expect(
      isVerifiedBillingTransitionAllowed(businessToPro, { kind: "active", plan: "pro" }, "scheduledChangeCanceled"),
    ).toBe(false);
    expect(isVerifiedBillingTransitionAllowed(businessToPro, { kind: "active", plan: "pro" })).toBe(true);
  });

  it("有料プラン有効化は結果待ち・復旧・Freeから許可し、ProからStandardへの即時遷移を拒否する", () => {
    const activePro = { kind: "active", plan: "pro" } as const;

    expect(
      isVerifiedBillingTransitionAllowed(
        { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 10 },
        activePro,
      ),
    ).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "free" }, activePro)).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "business" }, activePro)).toBe(false);
  });

  it("即時支払い失敗はpendingActivationに記録したfallbackだけへ戻せる", () => {
    const pendingFree = { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 10 } as const;
    const pendingRestricted = {
      kind: "pendingActivation",
      plan: "business",
      fallback: "restricted",
      startedAt: 10,
    } as const;
    const restricted: OrganizationBillingState = {
      kind: "restricted",
      reason: "paymentActivationFailed",
      recoveryManagerPersonIds: [],
      previousActiveShopIds: [],
      restrictedAt: 20,
    };

    expect(isVerifiedBillingTransitionAllowed(pendingFree, { kind: "active", plan: "free" })).toBe(true);
    expect(isVerifiedBillingTransitionAllowed(pendingFree, restricted)).toBe(false);
    expect(isVerifiedBillingTransitionAllowed(pendingRestricted, restricted)).toBe(true);
    expect(isVerifiedBillingTransitionAllowed(pendingRestricted, { kind: "active", plan: "free" })).toBe(false);
    expect(isVerifiedBillingTransitionAllowed(pendingRestricted, { kind: "trial", trialEndsAt: 30 })).toBe(false);
  });
});

describe("organizationBilling/policy scheduled transition", () => {
  const state = { kind: "trial", trialEndsAt: 100 } as const;

  it("期限前は適用せず、期限ちょうどで適用する", () => {
    expect(
      decideScheduledTransition({
        state,
        currentVersion: 2,
        expectedVersion: 2,
        expectedDeadlineAt: 100,
        now: 99,
      }),
    ).toEqual({ shouldApply: false, reason: "notDue" });
    expect(
      decideScheduledTransition({
        state,
        currentVersion: 2,
        expectedVersion: 2,
        expectedDeadlineAt: 100,
        now: 100,
      }),
    ).toEqual({ shouldApply: true, reason: "due" });
  });

  it("versionまたは期限が更新された古いjobはno-opにする", () => {
    expect(
      decideScheduledTransition({
        state,
        currentVersion: 3,
        expectedVersion: 2,
        expectedDeadlineAt: 100,
        now: 100,
      }),
    ).toEqual({ shouldApply: false, reason: "staleVersion" });
    expect(
      decideScheduledTransition({
        state,
        currentVersion: 2,
        expectedVersion: 2,
        expectedDeadlineAt: 90,
        now: 100,
      }),
    ).toEqual({ shouldApply: false, reason: "staleDeadline" });
  });

  it("期限を持たない状態へ遷移済みなら古いjobをno-opにする", () => {
    expect(
      decideScheduledTransition({
        state: { kind: "active", plan: "free" },
        currentVersion: 2,
        expectedVersion: 2,
        expectedDeadlineAt: 100,
        now: 100,
      }),
    ).toEqual({ shouldApply: false, reason: "staleDeadline" });
  });

  it("Trial、期間末変更、猶予の期限だけをscheduled deadlineとして返す", () => {
    expect(getOrganizationBillingStateDeadline(state)).toBe(100);
    expect(
      getOrganizationBillingStateDeadline({
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: 200,
      }),
    ).toBe(200);
    expect(getOrganizationBillingStateDeadline({ kind: "grace", plan: "pro", startedAt: 10, endsAt: 300 })).toBe(300);
    expect(getOrganizationBillingStateDeadline({ kind: "active", plan: "pro" })).toBeNull();
  });
});
