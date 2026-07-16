import { describe, expect, it } from "vitest";
import {
  calculateTrialEndsAt,
  createPaymentGraceState,
  decideScheduledTransition,
  deriveOrganizationBillingPolicy,
  evaluateFreeEligibility,
  evaluatePlanLimits,
  getOrganizationBillingStateDeadline,
  isVerifiedBillingTransitionAllowed,
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationBillingState,
  type OrganizationPersonUsageInput,
  PAYMENT_GRACE_PERIOD_MS,
  projectFreeUsage,
  projectOrganizationUsage,
  RESTRICTED_RECOVERY_CAPABILITIES,
} from "./policy";

describe("organizationBilling/policy plan limits", () => {
  it("Trial、Free、Pro、Businessの人数・店舗・管理者上限を定義する", () => {
    expect(ORGANIZATION_PLAN_LIMITS).toEqual({
      trial: { maxPeople: 30, maxActiveShops: 5, maxActiveManagers: 30 },
      free: { maxPeople: 4, maxActiveShops: 1, maxActiveManagers: 1 },
      pro: { maxPeople: 15, maxActiveShops: 5, maxActiveManagers: 15 },
      business: { maxPeople: 30, maxActiveShops: 5, maxActiveManagers: 30 },
    });
  });

  it("各プランの上限内と超過項目を判定する", () => {
    expect(evaluatePlanLimits("free", { peopleCount: 4, activeShopCount: 1, activeManagerCount: 1 })).toMatchObject({
      withinLimits: true,
      violations: [],
    });
    expect(evaluatePlanLimits("pro", { peopleCount: 16, activeShopCount: 6, activeManagerCount: 16 })).toMatchObject({
      withinLimits: false,
      violations: ["people", "activeShops", "activeManagers"],
    });
    expect(
      evaluatePlanLimits("business", { peopleCount: 30, activeShopCount: 5, activeManagerCount: 30 }),
    ).toMatchObject({ withinLimits: true });
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
  it("Trialと有効なPro・Businessは業務書き込みと有料機能を許可する", () => {
    const trial = deriveOrganizationBillingPolicy({ kind: "trial", trialEndsAt: 100 });
    const pro = deriveOrganizationBillingPolicy({ kind: "active", plan: "pro" });
    const business = deriveOrganizationBillingPolicy({ kind: "active", plan: "business" });

    expect(trial).toMatchObject({
      entitlementPlan: "trial",
      limits: ORGANIZATION_PLAN_LIMITS.trial,
      canWriteBusinessData: true,
      canUsePaidFeatures: true,
      deadlineAt: 100,
    });
    expect(pro).toMatchObject({
      entitlementPlan: "pro",
      limits: ORGANIZATION_PLAN_LIMITS.pro,
      canWriteBusinessData: true,
      canUsePaidFeatures: true,
    });
    expect(business).toMatchObject({
      entitlementPlan: "business",
      limits: ORGANIZATION_PLAN_LIMITS.business,
      canWriteBusinessData: true,
      canUsePaidFeatures: true,
    });
  });

  it("無償BusinessはBusinessの上限と有料機能を期限なしで利用できる", () => {
    const state = { kind: "complimentary", plan: "business" } as const;

    expect(deriveOrganizationBillingPolicy(state)).toEqual({
      entitlementPlan: "business",
      limits: ORGANIZATION_PLAN_LIMITS.business,
      canReadExistingData: true,
      canWriteBusinessData: true,
      businessWriteBlockReason: null,
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
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "freePlan",
    });
  });

  it("初回請求処理中は選択した有料プランの上限と機能を継続する", () => {
    expect(
      deriveOrganizationBillingPolicy({ kind: "initialPaymentPending", plan: "pro", startedAt: 10 }),
    ).toMatchObject({
      entitlementPlan: "pro",
      limits: ORGANIZATION_PLAN_LIMITS.pro,
      canWriteBusinessData: true,
      canUsePaidFeatures: true,
    });
    expect(
      deriveOrganizationBillingPolicy({ kind: "initialPaymentPending", plan: "business", startedAt: 10 }),
    ).toMatchObject({
      entitlementPlan: "business",
      limits: ORGANIZATION_PLAN_LIMITS.business,
      canWriteBusinessData: true,
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
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "restricted",
      allowedRecoveryCapabilities: RESTRICTED_RECOVERY_CAPABILITIES,
    });
  });

  it("FreeまたはProへの変更予定は期日まで現在の有料プランを維持する", () => {
    expect(
      deriveOrganizationBillingPolicy({
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "free",
        effectiveAt: 100,
      }),
    ).toMatchObject({
      entitlementPlan: "pro",
      limits: ORGANIZATION_PLAN_LIMITS.pro,
      canWriteBusinessData: true,
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
      entitlementPlan: "business",
      limits: ORGANIZATION_PLAN_LIMITS.business,
      canWriteBusinessData: true,
      canUsePaidFeatures: true,
      deadlineAt: 200,
    });
  });

  it("支払い猶予中は期限まで元の有料プランを維持する", () => {
    expect(deriveOrganizationBillingPolicy({ kind: "grace", plan: "pro", startedAt: 10, endsAt: 20 })).toMatchObject({
      entitlementPlan: "pro",
      canWriteBusinessData: true,
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
      canUsePaidFeatures: false,
      paidFeatureBlockReason: "restricted",
      allowedRecoveryCapabilities: RESTRICTED_RECOVERY_CAPABILITIES,
    });
  });
});

describe("organizationBilling/policy Free eligibility", () => {
  it("有効管理者1名、稼働店舗1件以下、利用人数4名以下で成立する", () => {
    expect(evaluateFreeEligibility({ peopleCount: 4, activeShopCount: 1, activeManagerCount: 1 })).toEqual({
      eligible: true,
      failures: [],
    });
    expect(evaluateFreeEligibility({ peopleCount: 1, activeShopCount: 0, activeManagerCount: 1 })).toEqual({
      eligible: true,
      failures: [],
    });
  });

  it("管理者未確定、複数店舗、人数超過を区別する", () => {
    expect(evaluateFreeEligibility({ peopleCount: 5, activeShopCount: 2, activeManagerCount: 0 })).toEqual({
      eligible: false,
      failures: ["activeManagerCount", "activeShopCount", "peopleCount"],
    });
  });
});

describe("organizationBilling/policy trial deadline", () => {
  it("事業者作成月の翌月末日の翌日00:00 JSTを返す", () => {
    const createdAt = Date.parse("2026-07-14T01:30:00.000Z");
    expect(calculateTrialEndsAt(createdAt)).toBe(Date.parse("2026-08-31T15:00:00.000Z"));
  });

  it("UTCでは前日になるJST月初と年またぎを正しく扱う", () => {
    expect(calculateTrialEndsAt(Date.parse("2026-06-30T15:00:00.000Z"))).toBe(Date.parse("2026-08-31T15:00:00.000Z"));
    expect(calculateTrialEndsAt(Date.parse("2026-12-31T14:59:59.000Z"))).toBe(Date.parse("2027-01-31T15:00:00.000Z"));
  });
});

describe("organizationBilling/policy payment grace", () => {
  it("最初の支払い失敗時刻から正確に14日後を猶予期限にする", () => {
    const firstFailureAt = Date.parse("2026-10-01T03:45:00.000Z");

    expect(createPaymentGraceState("pro", firstFailureAt)).toEqual({
      kind: "grace",
      plan: "pro",
      startedAt: firstFailureAt,
      endsAt: firstFailureAt + PAYMENT_GRACE_PERIOD_MS,
    });
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER,
  ])("不正な最初の失敗時刻 %s を拒否する", (value) => {
    expect(() => createPaymentGraceState("business", value)).toThrow(RangeError);
  });
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

    expect(isVerifiedBillingTransitionAllowed({ kind: "active", plan: "pro" }, grace)).toBe(true);
    expect(
      isVerifiedBillingTransitionAllowed({ kind: "initialPaymentPending", plan: "pro", startedAt: 50 }, grace),
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
      isVerifiedBillingTransitionAllowed({ kind: "active", plan: "pro" }, { ...businessToPro, currentPlan: "pro" }),
    ).toBe(false);
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
  });

  it("有料プラン有効化は結果待ち・復旧・Freeから許可し、BusinessからProへの即時遷移を拒否する", () => {
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
