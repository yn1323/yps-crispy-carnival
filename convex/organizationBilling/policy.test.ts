import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORGANIZATION_PLAN_LIMITS } from "./planLimits";
import {
  calculateTrialEndsAt,
  decideScheduledTransition,
  deriveOrganizationAccessPolicy,
  deriveOrganizationBillingPolicy,
  evaluateFreeEligibility,
  evaluateOrganizationUsageLimits,
  evaluatePlanLimits,
  getOrganizationBillingStateDeadline,
  isVerifiedBillingTransitionAllowed,
  type OrganizationBillingState,
  type OrganizationPersonUsageInput,
  projectFreeUsage,
  projectOrganizationUsage,
  resolveUsageLimitPlan,
} from "./policy";

describe("organizationBilling/policy plan limits", () => {
  it("Trial、Free、Standard、Proの人数・店舗・管理者上限を定義する", () => {
    expect(ORGANIZATION_PLAN_LIMITS).toEqual({
      trial: { maxPeople: 50, maxShops: 5, maxActiveManagers: 5 },
      free: { maxPeople: 5, maxShops: 1, maxActiveManagers: 2 },
      standard: { maxPeople: 25, maxShops: 5, maxActiveManagers: 5 },
      pro: { maxPeople: 50, maxShops: 5, maxActiveManagers: 5 },
    });
  });

  it("各プランの上限内と超過項目を判定する", () => {
    expect(evaluatePlanLimits("free", { peopleCount: 5, shopCount: 1, activeManagerCount: 1 })).toMatchObject({
      withinLimits: true,
      violations: [],
    });
    expect(evaluatePlanLimits("standard", { peopleCount: 25, shopCount: 5, activeManagerCount: 5 })).toMatchObject({
      withinLimits: true,
      violations: [],
    });
    expect(evaluatePlanLimits("standard", { peopleCount: 26, shopCount: 6, activeManagerCount: 6 })).toMatchObject({
      withinLimits: false,
      violations: ["people", "shops", "activeManagers"],
    });
    expect(evaluatePlanLimits("pro", { peopleCount: 50, shopCount: 5, activeManagerCount: 5 })).toMatchObject({
      withinLimits: true,
    });
    expect(evaluatePlanLimits("pro", { peopleCount: 51, shopCount: 5, activeManagerCount: 5 })).toMatchObject({
      withinLimits: false,
      violations: ["people"],
    });
    expect(evaluatePlanLimits("trial", { peopleCount: 51, shopCount: 5, activeManagerCount: 6 })).toMatchObject({
      withinLimits: false,
      violations: ["people", "activeManagers"],
    });
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
      state: { kind: "initialPaymentPending", plan: "pro", startedAt: 10 },
      expected: "free",
    },
    {
      name: "Freeからの有効化待ち",
      state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 10 },
      expected: "free",
    },
    {
      name: "Standardからの有効化待ち",
      state: { kind: "pendingActivation", plan: "pro", fallback: "standard", startedAt: 10 },
      expected: "standard",
    },
    {
      name: "Active Free",
      state: { kind: "active", plan: "free" },
      expected: "free",
    },
    {
      name: "Active Standard",
      state: { kind: "active", plan: "standard" },
      expected: "standard",
    },
    {
      name: "Active Pro",
      state: { kind: "active", plan: "pro" },
      expected: "pro",
    },
    {
      name: "無償Pro",
      state: { kind: "complimentary", plan: "pro" },
      expected: "pro",
    },
    {
      name: "ProからStandardへの変更予定",
      state: { kind: "scheduledChange", currentPlan: "pro", targetPlan: "standard", effectiveAt: 20 },
      expected: "pro",
    },
    {
      name: "ProからFreeへの変更予定",
      state: {
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "free",
        effectiveAt: 20,
        restrictAtPeriodEnd: true,
      },
      expected: "pro",
    },
    {
      name: "支払い失敗後の終了処理中",
      state: { kind: "paymentTerminationPending", previousPlan: "pro", startedAt: 10 },
      expected: "free",
    },
  ])("$nameの利用上限プランを$expectedとして解決する", ({ state, expected }) => {
    expect(resolveUsageLimitPlan(state)).toBe(expected);
  });
});

describe("organizationBilling/policy usage limit status", () => {
  it("上限ちょうどは利用数・上限とともに上限内として返す", () => {
    const usage = { peopleCount: 5, shopCount: 1, activeManagerCount: 2 };

    expect(evaluateOrganizationUsageLimits({ plan: "free", usage })).toEqual({
      kind: "withinLimits",
      evaluatedPlan: "free",
      usage,
      limits: ORGANIZATION_PLAN_LIMITS.free,
    });
  });

  it("複数の超過をkind・現在値・上限・超過数で正確に返す", () => {
    const usage = { peopleCount: 28, shopCount: 7, activeManagerCount: 8 };

    expect(evaluateOrganizationUsageLimits({ plan: "standard", usage })).toEqual({
      kind: "overLimit",
      evaluatedPlan: "standard",
      usage,
      limits: ORGANIZATION_PLAN_LIMITS.standard,
      violations: [
        { kind: "people", current: 28, max: 25, excess: 3 },
        { kind: "shops", current: 7, max: 5, excess: 2 },
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
      usage: { peopleCount: 5, shopCount: 1, activeManagerCount: 2 },
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
      usage: { peopleCount: 26, shopCount: 5, activeManagerCount: 5 },
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
      observedUsage: { peopleCount: 1, shopCount: 1, activeManagerCount: 1 },
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
    { personId: "staff-without-shop", isActiveInOrganization: true, isStaff: true, managerRole: "none" },
    { personId: "removed", isActiveInOrganization: false, isStaff: true, managerRole: "active" },
  ];

  it("人物単位で重複排除し、削除済み人物を算入しない", () => {
    expect(projectOrganizationUsage({ people, reservedPersonCount: 1 })).toEqual({
      currentPeopleCount: 3,
      activeManagerCount: 2,
      reservedPersonCount: 1,
      projectedPeopleCount: 4,
    });
  });

  it("Free移行では選択外の純粋管理者だけを除外し、スタッフ兼務者は数え続ける", () => {
    expect(projectFreeUsage(people, "manager-only")).toEqual({
      currentPeopleCount: 3,
      projectedPeopleCount: 3,
      projectedActiveManagerCount: 1,
      selectedManagerIsActive: true,
    });
  });

  it("選択した人物が有効管理者でなければFreeの管理者を成立させない", () => {
    expect(projectFreeUsage(people, "staff-without-shop")).toEqual({
      currentPeopleCount: 3,
      projectedPeopleCount: 2,
      projectedActiveManagerCount: 0,
      selectedManagerIsActive: false,
    });
  });
});

describe("organizationBilling/policy capabilities", () => {
  it("Trialと有料プランは対応する権限を許可する", () => {
    const trial = deriveOrganizationBillingPolicy({ kind: "trial", trialEndsAt: 100 });
    const standard = deriveOrganizationBillingPolicy({ kind: "active", plan: "standard" });
    const pro = deriveOrganizationBillingPolicy({ kind: "active", plan: "pro" });

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
    expect(standard).toMatchObject({
      paidPlan: "standard",
      entitlementPlan: "standard",
      displayPlan: "standard",
      targetingPlan: "standard",
      limits: ORGANIZATION_PLAN_LIMITS.standard,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
    });
    expect(pro).toMatchObject({
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

  it("無償Proは50人上限と有料機能を期限なしで利用できる", () => {
    const state = { kind: "complimentary", plan: "pro" } as const;

    expect(deriveOrganizationBillingPolicy(state)).toEqual({
      paidPlan: null,
      entitlementPlan: "pro",
      displayPlan: "pro",
      targetingPlan: "pro",
      limits: { maxPeople: 50, maxShops: 5, maxActiveManagers: 5 },
      canReadExistingData: true,
      canWriteBusinessData: true,
      businessWriteBlockReason: null,
      canManageManagers: true,
      canUsePaidFeatures: true,
      paidFeatureBlockReason: null,
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

  it("初回請求処理中は支払い成功までFree権限にする", () => {
    expect(
      deriveOrganizationBillingPolicy({ kind: "initialPaymentPending", plan: "pro", startedAt: 10 }),
    ).toMatchObject({
      paidPlan: "pro",
      entitlementPlan: "free",
      displayPlan: "free",
      limits: ORGANIZATION_PLAN_LIMITS.free,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "freePlan",
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
    });
  });

  it("FreeまたはStandardへの変更予定は期日まで現在の有料プランを維持する", () => {
    expect(
      deriveOrganizationBillingPolicy({
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "free",
        effectiveAt: 100,
        restrictAtPeriodEnd: true,
      }),
    ).toMatchObject({
      entitlementPlan: "pro",
      limits: ORGANIZATION_PLAN_LIMITS.pro,
      canWriteBusinessData: true,
      canManageManagers: true,
      canUsePaidFeatures: true,
      deadlineAt: 100,
    });
    expect(
      deriveOrganizationBillingPolicy({
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "standard",
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

  it("支払い失敗後の契約終了処理中は即時Free権限にする", () => {
    expect(
      deriveOrganizationBillingPolicy({ kind: "paymentTerminationPending", previousPlan: "pro", startedAt: 10 }),
    ).toMatchObject({
      paidPlan: null,
      entitlementPlan: "free",
      displayPlan: "free",
      limits: ORGANIZATION_PLAN_LIMITS.free,
      canWriteBusinessData: true,
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "freePlan",
      deadlineAt: null,
    });
  });
});

describe("organizationBilling/policy Free eligibility", () => {
  it("有効管理者1〜2名、店舗1件以下、利用人数5名以下で成立する", () => {
    expect(evaluateFreeEligibility({ peopleCount: 5, shopCount: 1, activeManagerCount: 1 })).toEqual({
      eligible: true,
      failures: [],
    });
    expect(evaluateFreeEligibility({ peopleCount: 1, shopCount: 0, activeManagerCount: 1 })).toEqual({
      eligible: true,
      failures: [],
    });
    expect(evaluateFreeEligibility({ peopleCount: 5, shopCount: 1, activeManagerCount: 2 })).toEqual({
      eligible: true,
      failures: [],
    });
  });

  it("管理者未確定、管理者3名、複数店舗、人数超過を区別する", () => {
    expect(evaluateFreeEligibility({ peopleCount: 6, shopCount: 2, activeManagerCount: 0 })).toEqual({
      eligible: false,
      failures: ["activeManagerCount", "shopCount", "peopleCount"],
    });
    expect(evaluateFreeEligibility({ peopleCount: 3, shopCount: 1, activeManagerCount: 3 })).toEqual({
      eligible: false,
      failures: ["activeManagerCount"],
    });
  });
});

describe("organizationBilling/policy trial deadline", () => {
  beforeEach(() => {
    vi.stubEnv("DEBUG_MODE", "");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("JSTの事業者作成日から2か月後の同日00:00を返す", () => {
    const createdAt = Date.parse("2026-07-14T01:30:00.000Z");
    expect(calculateTrialEndsAt(createdAt)).toBe(Date.parse("2026-09-13T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-07-14T14:59:59.000Z"))).toBe(Date.parse("2026-09-13T15:00:00.000Z"));
  });

  it("UTCでは前日になるJSTの日付境界を正しく扱う", () => {
    expect(calculateTrialEndsAt(Date.parse("2026-06-30T14:59:59.000Z"))).toBe(Date.parse("2026-08-29T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-06-30T15:00:00.000Z"))).toBe(Date.parse("2026-08-31T15:00:00.000Z"));
  });

  it("非うるう年の2月に同じ日がなければ月末へ丸める", () => {
    expect(calculateTrialEndsAt(Date.parse("2026-12-31T14:59:59.000Z"))).toBe(Date.parse("2027-02-27T15:00:00.000Z"));
  });

  it("閏年の2月末へ丸める", () => {
    expect(calculateTrialEndsAt(Date.parse("2027-12-31T14:59:59.000Z"))).toBe(Date.parse("2028-02-28T15:00:00.000Z"));
  });

  it.each(["", "true"])("日数未設定ならDEBUG_MODE=%sでも2か月を維持する", (debugMode) => {
    vi.stubEnv("DEBUG_MODE", debugMode);

    expect(calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toBe(Date.parse("2026-09-13T15:00:00.000Z"));
  });

  it("DEBUG_MODEが無効なまま日数が設定されていれば拒否する", () => {
    vi.stubEnv("DEBUG_MODE", "false");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "7");

    expect(() => calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toThrowError(
      "DEBUG_TRIAL_DURATION_DAYS requires DEBUG_MODE=true",
    );
  });

  it("DEBUG_MODE=trueの1日を登録日の翌日00:00 JSTとして扱う", () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "1");

    expect(calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toBe(Date.parse("2026-07-14T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-07-14T14:59:59.000Z"))).toBe(Date.parse("2026-07-14T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-07-14T15:00:00.000Z"))).toBe(Date.parse("2026-07-15T15:00:00.000Z"));
  });

  it("範囲内の中間値をJST暦日として計算する", () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "7");

    expect(calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toBe(Date.parse("2026-07-20T15:00:00.000Z"));
  });

  it("30日を月・年をまたぐJST暦日として計算する", () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "30");

    expect(calculateTrialEndsAt(Date.parse("2026-12-15T03:00:00.000Z"))).toBe(Date.parse("2027-01-13T15:00:00.000Z"));
  });

  it.each(["0", "-1", "1.5", "1e1", "01", "31", "abc", "9007199254740992"])(
    "DEBUG_MODE=trueで不正な日数 %s を拒否する",
    (value) => {
      vi.stubEnv("DEBUG_MODE", "true");
      vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", value);

      expect(() => calculateTrialEndsAt(Date.parse("2026-07-14T01:30:00.000Z"))).toThrowError(RangeError);
    },
  );
});

describe("organizationBilling/policy verified transition", () => {
  it("無償Proを検証済み課金結果から作成または別状態へ変更できない", () => {
    const complimentary = { kind: "complimentary", plan: "pro" } as const;
    const destinations: OrganizationBillingState[] = [
      { kind: "trial", trialEndsAt: 100 },
      { kind: "initialPaymentPending", plan: "pro", startedAt: 100 },
      { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 100 },
      { kind: "active", plan: "pro" },
      { kind: "scheduledChange", currentPlan: "pro", targetPlan: "standard", effectiveAt: 200 },
      { kind: "paymentTerminationPending", previousPlan: "pro", startedAt: 100 },
      complimentary,
    ];

    for (const destination of destinations) {
      expect(isVerifiedBillingTransitionAllowed(complimentary, destination)).toBe(false);
    }
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "pro" }, complimentary)).toBe(false);
  });

  it("支払い失敗は検証済みの元プランが一致するときだけ終了処理へ移せる", () => {
    const paidFailure = { kind: "paymentTerminationPending", previousPlan: "pro", startedAt: 100 } as const;
    const trialFailure = { kind: "paymentTerminationPending", previousPlan: "trial", startedAt: 100 } as const;

    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "pro" }, paidFailure)).toBe(true);
    expect(
      isVerifiedBillingTransitionAllowed({ kind: "initialPaymentPending", plan: "pro", startedAt: 50 }, trialFailure),
    ).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "standard" }, paidFailure)).toBe(false);
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "free" }, paidFailure)).toBe(false);
    expect(isVerifiedBillingTransitionAllowed(paidFailure, { kind: "active", plan: "free" })).toBe(true);
  });

  it("プラン変更予約はStandardからFree、ProからStandardまたはFreeを許可する", () => {
    const proToStandard = {
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "standard",
      effectiveAt: 200,
    } as const;

    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "pro" }, proToStandard)).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "trial", trialEndsAt: 100 }, proToStandard)).toBe(false);
    expect(
      isVerifiedBillingTransitionAllowed(
        { kind: "active", plan: "pro" },
        {
          kind: "scheduledChange",
          currentPlan: "pro",
          targetPlan: "free",
          effectiveAt: 200,
          restrictAtPeriodEnd: true,
        },
      ),
    ).toBe(true);
  });

  it("期間末変更は明示した取消eventだけが現在プランへ戻せる", () => {
    const proToFree = {
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      effectiveAt: 200,
      restrictAtPeriodEnd: true,
    } as const;
    const proToStandard = {
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "standard",
      effectiveAt: 200,
    } as const;

    expect(isVerifiedBillingTransitionAllowed(proToFree, { kind: "active", plan: "pro" })).toBe(false);
    expect(
      isVerifiedBillingTransitionAllowed(proToFree, { kind: "active", plan: "pro" }, "scheduledChangeCanceled"),
    ).toBe(true);
    expect(
      isVerifiedBillingTransitionAllowed(proToStandard, { kind: "active", plan: "pro" }, "scheduledChangeCanceled"),
    ).toBe(true);
    expect(isVerifiedBillingTransitionAllowed(proToStandard, { kind: "active", plan: "standard" })).toBe(true);
  });

  it("有料プラン有効化は結果待ちとFreeから許可し、ProからStandardへの即時遷移を拒否する", () => {
    const activePro = { kind: "active", plan: "pro" } as const;

    expect(
      isVerifiedBillingTransitionAllowed(
        { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 10 },
        activePro,
      ),
    ).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "free" }, activePro)).toBe(true);
    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "standard" }, activePro)).toBe(false);
  });

  it("即時支払い失敗はpendingActivationに記録したFreeまたはStandardへだけ戻せる", () => {
    const pendingFree = { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: 10 } as const;
    const pendingStandard = {
      kind: "pendingActivation",
      plan: "pro",
      fallback: "standard",
      startedAt: 10,
    } as const;

    expect(isVerifiedBillingTransitionAllowed(pendingFree, { kind: "active", plan: "free" })).toBe(true);
    expect(
      isVerifiedBillingTransitionAllowed(pendingStandard, { kind: "active", plan: "standard" }, "activationFailed"),
    ).toBe(true);
    expect(isVerifiedBillingTransitionAllowed(pendingStandard, { kind: "active", plan: "free" })).toBe(false);
    expect(isVerifiedBillingTransitionAllowed(pendingStandard, { kind: "trial", trialEndsAt: 30 })).toBe(false);
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

  it("Trialと期間末変更の期限だけをscheduled deadlineとして返す", () => {
    expect(getOrganizationBillingStateDeadline(state)).toBe(100);
    expect(
      getOrganizationBillingStateDeadline({
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "standard",
        effectiveAt: 200,
      }),
    ).toBe(200);
    expect(
      getOrganizationBillingStateDeadline({ kind: "paymentTerminationPending", previousPlan: "pro", startedAt: 10 }),
    ).toBeNull();
    expect(getOrganizationBillingStateDeadline({ kind: "active", plan: "pro" })).toBeNull();
  });
});
