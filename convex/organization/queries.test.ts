import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  seedLegacyManagerShop,
  seedOrganizationManagerShop,
  seedOrganizationMembership,
  seedOrganizationPersonLineLink,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("organization/queries.getSettings", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_settings_query");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_settings_query");
    vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "price_settings_standard_query");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_settings_pro_query");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_settings_query");
  });

  it("保存済みの組織共通順をsettings.peopleへ反映し、店舗所属の部分列と不整合時の既存順を維持する", async () => {
    const t = convexTest(schema, modules);
    const subject = "settings_staff_order";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "別店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const now = Date.now();
      const insertStaffPerson = async (args: { name: string; email: string; shopIds: Id<"shops">[] }) => {
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: args.name,
          email: args.email,
          emailNormalized: args.email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const staffIds: Id<"staffs">[] = [];
        for (const shopId of args.shopIds) {
          staffIds.push(
            await ctx.db.insert("staffs", {
              organizationId: base.organizationId,
              organizationPersonId: personId,
              shopId,
              name: args.name,
              email: args.email,
              emailNormalized: args.email,
              isDeleted: false,
            }),
          );
        }
        return { personId, staffIds };
      };
      const akari = await insertStaffPerson({
        name: "あかり",
        email: "akari-settings-order@example.com",
        shopIds: [base.shopId, secondShopId],
      });
      const ibuki = await insertStaffPerson({
        name: "いぶき",
        email: "ibuki-settings-order@example.com",
        shopIds: [base.shopId],
      });
      const umi = await insertStaffPerson({
        name: "うみ",
        email: "umi-settings-order@example.com",
        shopIds: [secondShopId],
      });
      const orderedPersonIds = [umi.personId, ibuki.personId, base.personId, akari.personId];
      await ctx.db.insert("organizationStaffOrderStates", {
        organizationId: base.organizationId,
        revision: 1,
        activatedAt: now,
        updatedAt: now,
      });
      for (const [displayOrder, organizationPersonId] of orderedPersonIds.entries()) {
        await ctx.db.insert("organizationStaffOrderEntries", {
          organizationId: base.organizationId,
          organizationPersonId,
          displayOrder,
        });
      }
      const globalRank = new Map(orderedPersonIds.map((personId, index) => [personId, index] as const));
      for (const [shopId, staffRows] of [
        [base.shopId, [akari.staffIds[0], ibuki.staffIds[0]]],
        [secondShopId, [akari.staffIds[1], umi.staffIds[0]]],
      ] as const) {
        for (const staffId of staffRows) {
          if (!staffId) throw new Error("staff not found");
          const staff = await ctx.db.get(staffId);
          if (!staff?.organizationPersonId) throw new Error("organization person not found");
          await ctx.db.insert("shopStaffOrderEntries", {
            organizationId: base.organizationId,
            shopId,
            staffId,
            organizationPersonId: staff.organizationPersonId,
            displayOrder: globalRank.get(staff.organizationPersonId) ?? Number.MAX_SAFE_INTEGER,
          });
        }
      }
      return { base, akari, ibuki, umi, orderedPersonIds };
    });
    const actor = t.withIdentity({ subject });

    const ordered = await actor.query(api.organization.queries.getSettings, { shopId: ids.base.shopId });
    if (!ordered) throw new Error("settings not found");
    expect(ordered.people.map((person) => person.id)).toEqual(ids.orderedPersonIds);
    expect(
      ordered.people
        .filter((person) => person.shopIds.map(String).includes(String(ids.base.shopId)))
        .map((person) => person.id),
    ).toEqual([ids.ibuki.personId, ids.akari.personId]);

    await t.run(async (ctx) => {
      const entry = await ctx.db
        .query("organizationStaffOrderEntries")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", ids.base.organizationId).eq("organizationPersonId", ids.ibuki.personId),
        )
        .unique();
      if (!entry) throw new Error("organization staff order entry not found");
      await ctx.db.delete(entry._id);
    });

    const legacy = await actor.query(api.organization.queries.getSettings, { shopId: ids.base.shopId });
    if (!legacy) throw new Error("settings not found");
    expect(legacy.people.map((person) => person.id)).toEqual([
      ids.base.personId,
      ids.akari.personId,
      ids.ibuki.personId,
      ids.umi.personId,
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("トライアルを利用できる最終日のJST日付を返す", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_trial_date",
        plan: "free",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("organizationBillingState not found");
      await ctx.db.patch(billingState._id, { state: { kind: "trial", trialEndsAt } });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_trial_date" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing.state).toBe("trial");
    if (!result || !("nextEvent" in result.billing)) throw new Error("trial billing view not found");
    expect(result.billing.nextEvent).toEqual({ label: "トライアル最終日", date: "2026年8月31日" });
    expect(result.billing.trialEndsAt).toBe(trialEndsAt);
    expect(result.billing.hasTrialContinuation).toBe(false);
    expect(result.billing.canUpdatePaymentMethod).toBe(false);
    expect(result.billing.paymentMethodDisabledReason).toBe(
      "トライアル終了後の有料プラン継続を登録すると、Stripeで支払い情報を管理できます。",
    );
    expect(result.billing.canScheduleFree).toBe(false);
  });

  it("トライアル終了後の有料プラン継続登録済み状態を画面用DTOへ返す", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_trial_continuation",
        plan: "free",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("organizationBillingState not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt, selectedPaidPlan: "pro" },
      });
      const now = Date.now();
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: base.organizationId,
        stripeCustomerId: "cus_settings_trial_continuation",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_trial_continuation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "trial",
      currentPlan: "trial",
      hasTrialContinuation: true,
      hasStripeCustomer: true,
      canUpdatePaymentMethod: true,
      canScheduleFree: false,
    });
  });

  it("Stripe Customer未作成ではPortal操作を停止する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "settings_customer_missing",
          plan: "pro",
        }),
    );

    const result = await t
      .withIdentity({ subject: "settings_customer_missing" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "pro",
      hasStripeCustomer: false,
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "Stripeの契約情報を準備中です。\nしばらくしてから、もう一度お試しください。",
    });
  });

  it("Secret KeyとCustomerのlivemodeが一致しない場合はPortal操作を停止する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_customer_livemode_mismatch",
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: base.organizationId,
        stripeCustomerId: "cus_settings_livemode_mismatch",
        livemode: true,
        createdAt: now,
        updatedAt: now,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_customer_livemode_mismatch" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "pro",
      stripeBillingAvailable: true,
      hasStripeCustomer: true,
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason:
        "Stripeの契約情報と決済設定を確認中です。\nしばらくしてから、もう一度お試しください。",
    });
  });

  it("事業者設定を画面用DTOへ投影し、tokenや内部状態を返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_actor",
        shopName: "設定対象店",
        plan: "pro",
      });
      await ctx.db.patch(base.shopId, {
        regularClosedDays: ["mon", "thu"],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const now = Date.now();
      await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        invitedName: "招待対象",
        email: "invitee@example.com",
        emailNormalized: "invitee@example.com",
        tokenDigest: "never-return-this-digest",
        status: "issued",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: base.organizationId,
        stripeCustomerId: "cus_never_return_this_id",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_actor" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {}).sort()).toEqual([
      "billing",
      "canAddShop",
      "canCreateOrganization",
      "canDeleteOrganization",
      "canInviteManager",
      "canUpdateOrganizationName",
      "deleteOrganizationDisabledReason",
      "managerInvitations",
      "organizationId",
      "organizationName",
      "organizationUpdatedAt",
      "people",
      "shops",
    ]);
    expect(result).toMatchObject({
      organizationId: ids.organizationId,
      organizationUpdatedAt: expect.any(Number),
      organizationName: "設定対象店事業者",
      canAddShop: true,
      canCreateOrganization: true,
      canInviteManager: true,
      managerInvitations: [
        {
          id: expect.any(String),
          email: "invitee@example.com",
          status: "pending",
          canResend: true,
          canRevoke: true,
        },
      ],
      canUpdateOrganizationName: true,
      canDeleteOrganization: false,
      deleteOrganizationDisabledReason: "組織を削除するには、先に有料契約やプラン変更を終了してください。",
      billing: {
        state: "pro",
        currentPlan: "pro",
        isComplimentary: false,
        hasTrialContinuation: false,
        hasStripeCustomer: true,
        peopleUsage: { current: 1, max: 25, pendingInvitations: 1 },
        shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
        managerUsage: { current: 1, max: 5, pendingInvitations: 1 },
        requiredReductions: { people: 0, shops: 0, managers: 0 },
        stripeBillingAvailable: true,
        canUpdatePaymentMethod: true,
        canScheduleFree: true,
      },
      people: [
        {
          id: ids.personId,
          managerRole: "active",
          isStaff: false,
          isLineConnected: false,
          lineStatus: "unlinked",
          shopNames: [],
          shopIds: [],
          canRemoveManagerRole: false,
        },
      ],
      shops: [
        {
          id: ids.shopId,
          name: "設定対象店",
          regularClosedDays: ["mon", "thu"],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          staffCount: expect.any(Number),
          managerNotificationRecipientStatus: "none",
          canUpdateSettings: true,
          canDelete: false,
        },
      ],
    });
    expect(Object.keys(result?.shops[0] ?? {}).sort()).toEqual([
      "canDelete",
      "canUpdateSettings",
      "deleteDisabledReason",
      "id",
      "managerNotificationRecipientStatus",
      "name",
      "regularClosedDays",
      "staffCount",
      "submissionPattern",
    ]);
    expect(Object.keys(result?.people[0] ?? {}).sort()).toEqual([
      "canRemove",
      "canRemoveManagerRole",
      "email",
      "hasManagerInvitation",
      "id",
      "isLineConnected",
      "isStaff",
      "lineStatus",
      "managerRole",
      "managerRoleRemovalDisabledReason",
      "name",
      "removeDisabledReason",
      "shopIds",
      "shopNames",
    ]);
    expect(JSON.stringify(result)).not.toContain("never-return-this-digest");
    expect(JSON.stringify(result)).not.toContain("cus_never_return_this_id");
    expect(JSON.stringify(result)).not.toContain("sk_test_settings_query");
    expect(result?.billing).not.toHaveProperty("paymentMethodLabel");
    expect(result?.billing).not.toHaveProperty("invoices");
    expect(result).not.toHaveProperty("freeSelection");
    expect(result).not.toHaveProperty("currentShopName");
  });

  it("active.freeの上限超過はFree表示を維持し、縮小・契約操作だけを許可する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "settings_free_over_limit", plan: "free" });
      const now = Date.now();
      const addManager = async (suffix: string) => {
        const userId = await seedUser(ctx, `settings_free_over_limit_${suffix}`);
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          userId,
          name: `追加管理者${suffix}`,
          email: `${suffix}@example.com`,
          emailNormalized: `${suffix}@example.com`,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId,
          userId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        return personId;
      };
      const secondManagerPersonId = await addManager("second");
      await addManager("third");
      await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "上限超過店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        invitedName: "上限予約対象",
        email: "pending-over-limit@example.com",
        emailNormalized: "pending-over-limit@example.com",
        tokenDigest: "settings-free-over-limit-pending",
        status: "issued",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, secondManagerPersonId };
    });

    const result = await t
      .withIdentity({ subject: "settings_free_over_limit" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 3, max: 5, pendingInvitations: 1 },
      shopUsage: { current: 2, max: 1 },
      managerUsage: { current: 3, max: 2, pendingInvitations: 1 },
      requiredReductions: { people: 0, shops: 1, managers: 1 },
      blockedReason: expect.stringContaining("利用上限を超えています"),
      canManagePlan: true,
    });
    expect(result).toMatchObject({
      canUpdateOrganizationName: false,
      canAddShop: false,
      canInviteManager: false,
    });
    expect(result?.managerInvitations[0]).toMatchObject({ canRevoke: true });
    expect(result?.people.find((person) => person.id === ids.secondManagerPersonId)).toMatchObject({
      canRemoveManagerRole: true,
    });
    expect(result?.shops.every((shop) => !shop.canUpdateSettings && shop.canDelete)).toBe(true);
  });

  it("利用数を安全に確定できない場合は通常操作を閉じ、縮小操作だけを維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_usage_unknown",
        plan: "business",
      });
      const now = Date.now();
      let recoveryPersonId: Id<"organizationPeople"> | null = null;
      for (let index = 0; index < 100; index += 1) {
        const email = `settings-usage-unknown-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: `利用状態未確定人物${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        recoveryPersonId ??= personId;
      }
      if (!recoveryPersonId) throw new Error("整理対象人物を作成できませんでした");
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "整理可能店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      return { ...base, recoveryPersonId, secondShopId };
    });

    const result = await t
      .withIdentity({ subject: "settings_usage_unknown" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "business",
      blockedReason: expect.stringContaining("利用数を安全に確認できない"),
      canManagePlan: true,
    });
    expect(result).toMatchObject({
      canUpdateOrganizationName: false,
      canAddShop: false,
      canInviteManager: false,
    });
    expect(result?.shops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ids.shopId, canUpdateSettings: false, canDelete: true }),
        expect.objectContaining({ id: ids.secondShopId, canUpdateSettings: false, canDelete: true }),
      ]),
    );
    expect(result?.shops[0]?.settingsDisabledReason).toContain("利用数を安全に確認できない");
    expect(result?.people.find((person) => person.id === ids.recoveryPersonId)).toMatchObject({
      managerRole: "none",
      isStaff: false,
      canRemove: true,
    });
  });

  it("対象店舗に所属するactive管理者がいれば店舗通知の受信者ありを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_local_manager_recipient",
        email: "local-manager@example.com",
        plan: "pro",
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "店舗所属管理者",
        email: "local-manager@example.com",
        emailNormalized: "local-manager@example.com",
        isDeleted: false,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_local_manager_recipient" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.shops[0]?.managerNotificationRecipientStatus).toBe("available");
  });

  it("管理者走査上限の外に店舗所属者がいる可能性を受信者なしと誤判定しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_manager_recipient_overflow",
        plan: "pro",
      });
      for (let index = 1; index < 20; index += 1) {
        const userId = await seedUser(ctx, `settings_nonlocal_manager_${index}`);
        await seedOrganizationMembership(ctx, { userId, shopId: base.shopId });
      }
      const localUserId = await seedUser(ctx, "settings_overflow_local_manager", "overflow-local@example.com");
      await seedOrganizationMembership(ctx, { userId: localUserId, shopId: base.shopId });
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", base.organizationId).eq("userId", localUserId),
        )
        .take(2);
      const [localPerson] = people;
      if (people.length !== 1 || !localPerson) throw new Error("overflow manager person not found");
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: localPerson._id,
        userId: localUserId,
        name: "走査上限外の店舗所属管理者",
        email: "overflow-local@example.com",
        emailNormalized: "overflow-local@example.com",
        isDeleted: false,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_manager_recipient_overflow" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.shops[0]?.managerNotificationRecipientStatus).toBe("unknown");
  });

  it("Stripe課金が未準備でもトライアル権利を維持し、決済操作だけを停止する", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_stripe_off_trial",
        plan: "free",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: Date.parse("2026-09-01T00:00:00+09:00") },
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_stripe_off_trial" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "trial",
      currentPlan: "trial",
      peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
      stripeBillingAvailable: false,
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: true,
      canScheduleFree: false,
      managePlanDisabledReason: "有料プランの料金は準備中です。",
      paymentMethodDisabledReason: "有料プランの料金は準備中です。",
    });
  });

  it("Stripe設定が未準備でも既存Customerの存在表示を維持し、Portal操作だけを停止する", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_stripe_off_existing_customer",
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: base.organizationId,
        stripeCustomerId: "cus_settings_stripe_off",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_stripe_off_existing_customer" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "pro",
      stripeBillingAvailable: false,
      hasStripeCustomer: true,
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "有料プランの料金は準備中です。",
    });
  });

  it("旧形式のstatus未設定店舗は稼働中として数え、アーカイブ済みは数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_active_shop_usage",
        plan: "pro",
      });
      let legacyActiveShopId: Id<"shops"> | null = null;
      for (const [index, operatingStatus] of ["active", "active", "active", undefined, "archived"].entries()) {
        const shopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          ...(operatingStatus ? { operatingStatus: operatingStatus as "active" | "archived" } : {}),
          name: `店舗${index}`,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        if (operatingStatus === undefined) legacyActiveShopId = shopId;
      }
      if (!legacyActiveShopId) throw new Error("legacy active shop fixture was not created");
      return { ...base, legacyActiveShopId };
    });

    const result = await t
      .withIdentity({ subject: "settings_active_shop_usage" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing.shopUsage).toEqual({ current: 5, max: 5, pendingInvitations: 0 });
    expect(result?.shops).toHaveLength(6);
    expect(result?.shops.find((shop) => shop.id === ids.legacyActiveShopId)?.canUpdateSettings).toBe(true);
    expect(result?.canAddShop).toBe(false);
  });

  it("組織移行前のDTOでは所属店舗IDを空配列で返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedLegacyManagerShop(ctx, { subject: "settings_legacy_shop_ids", shopName: "移行前店舗" }),
    );

    const result = await t
      .withIdentity({ subject: "settings_legacy_shop_ids" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing.state).toBe("migrationPending");
    expect(result?.people).toEqual([expect.objectContaining({ id: ids.userId, shopIds: [] })]);
    // 組織作成は選択中組織の移行状態に依存しない。移行前の店舗も上限へ1件として数える。
    expect(result?.canCreateOrganization).toBe(true);
    expect(result?.createOrganizationDisabledReason).toBeUndefined();
  });

  it("上限まで作成済みの利用者には組織作成不可と理由を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "settings_create_limit", plan: "pro" });
      const now = Date.now();
      for (const name of ["二つ目", "三つ目"]) {
        await ctx.db.insert("organizations", {
          createdByUserId: base.userId,
          name,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        });
      }
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_create_limit" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.canCreateOrganization).toBe(false);
    expect(result?.createOrganizationDisabledReason).toBe("作成できる組織は3つまでです");
  });

  it("利用上限超過中でも新しい組織の作成可否は下げない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "settings_create_over_limit", plan: "free" });
      for (let index = 0; index < 2; index += 1) {
        const userId = await seedUser(ctx, `settings_create_over_limit_${index}`);
        await seedOrganizationMembership(ctx, { userId, shopId: base.shopId });
      }
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_create_over_limit" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.canAddShop).toBe(false);
    expect(result?.canCreateOrganization).toBe(true);
  });

  it("Freeかつ唯一の有効管理者には、最新組織IDと更新時刻を含む削除可能状態を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "settings_deletable", plan: "free" }),
    );

    const result = await t
      .withIdentity({ subject: "settings_deletable" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result).toMatchObject({
      organizationId: ids.organizationId,
      organizationUpdatedAt: expect.any(Number),
      canDeleteOrganization: true,
    });
    expect(result).not.toHaveProperty("deleteOrganizationDisabledReason");
  });

  it("削除済みstaff履歴で利用人数に含む店舗未所属ユーザーを一覧へ残す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_unassigned_staff",
        shopName: "所属確認店",
        plan: "business",
      });
      const now = Date.now();
      const unassignedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "店舗未所属スタッフ",
        email: "unassigned-staff@example.com",
        emailNormalized: "unassigned-staff@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: unassignedPersonId,
        name: "店舗未所属スタッフ",
        email: "unassigned-staff@example.com",
        emailNormalized: "unassigned-staff@example.com",
        isDeleted: true,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "利用人数対象外",
        email: "uncounted-person@example.com",
        emailNormalized: "uncounted-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, unassignedPersonId };
    });

    const result = await t
      .withIdentity({ subject: "settings_unassigned_staff" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing.peopleUsage).toEqual({ current: 2, max: 50, pendingInvitations: 0 });
    expect(
      result?.people.map(({ id, isStaff, managerRole, shopNames, shopIds }) => ({
        id,
        isStaff,
        managerRole,
        shopNames,
        shopIds,
      })),
    ).toEqual([
      { id: ids.personId, isStaff: false, managerRole: "active", shopNames: [], shopIds: [] },
      { id: ids.unassignedPersonId, isStaff: false, managerRole: "none", shopNames: [], shopIds: [] },
    ]);
  });

  it("同名店舗でも有効staff由来の所属店舗IDを区別し、重複と削除済みstaffを除く", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_duplicate_shop_names",
        shopName: "同名店舗",
        plan: "pro",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "同名店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const deletedStaffShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "削除済み所属店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const now = Date.now();
      const staffPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "複数店舗スタッフ",
        email: "duplicate-shops-staff@example.com",
        emailNormalized: "duplicate-shops-staff@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const insertStaff = async (shopId: Id<"shops">, isDeleted: boolean) =>
        await ctx.db.insert("staffs", {
          shopId,
          organizationId: base.organizationId,
          organizationPersonId: staffPersonId,
          name: "複数店舗スタッフ",
          email: "duplicate-shops-staff@example.com",
          emailNormalized: "duplicate-shops-staff@example.com",
          isDeleted,
        });
      await insertStaff(base.shopId, false);
      await insertStaff(base.shopId, false);
      await insertStaff(secondShopId, false);
      await insertStaff(deletedStaffShopId, true);
      return { ...base, secondShopId, deletedStaffShopId, staffPersonId };
    });

    const result = await t
      .withIdentity({ subject: "settings_duplicate_shop_names" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    const person = result?.people.find((candidate) => candidate.id === ids.staffPersonId);
    expect(person?.shopNames).toEqual(["同名店舗"]);
    expect(person?.shopIds).toEqual([ids.shopId, ids.secondShopId].sort((a, b) => String(a).localeCompare(String(b))));
    expect(person?.shopIds).not.toContain(ids.deletedStaffShopId);
  });

  it("組織人物の共通LINE連携と友だち状態を返し、raw IDは返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_line_connected",
        shopName: "LINE設定店",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
        emailNormalized: "line-staff@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: personId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
        emailNormalized: "line-staff@example.com",
        isDeleted: false,
      });
      const line = await seedOrganizationPersonLineLink(ctx, {
        organizationId: base.organizationId,
        organizationPersonId: personId,
        lineUserId: "line-user-settings",
      });
      return { ...base, lineProviderUserId: line.lineProviderUserId, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_line_connected" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    const person = result?.people.find((candidate) => candidate.id === ids.personId);
    expect(person).toMatchObject({ isStaff: true, isLineConnected: true, lineStatus: "linked_following" });
    expect(person).not.toHaveProperty("lineUserId");

    await t.run(async (ctx) => await ctx.db.patch(ids.lineProviderUserId, { following: false }));
    const unfollowedResult = await t
      .withIdentity({ subject: "settings_line_connected" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(unfollowedResult?.people.find((candidate) => candidate.id === ids.personId)).toMatchObject({
      isLineConnected: true,
      lineStatus: "linked_unfollowed",
    });
  });

  it("既存人物には期限内のissued招待がある時だけ再送可能状態を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_manager_invitation",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "招待中の人物",
        email: "invited-person@example.com",
        emailNormalized: "invited-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: personId,
        name: "招待中の人物",
        email: "invited-person@example.com",
        emailNormalized: "invited-person@example.com",
        isDeleted: false,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "invited-person@example.com",
        emailNormalized: "invited-person@example.com",
        invitedName: "招待中の人物",
        tokenDigest: "issued-invitation-digest",
        status: "issued",
        targetPersonId: personId,
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_manager_invitation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      managerRole: "none",
      isStaff: true,
      hasManagerInvitation: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.invitationId, { status: "expired", expiredAt: Date.now(), reservedSeat: false });
    });
    const expiredResult = await t
      .withIdentity({ subject: "settings_manager_invitation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(expiredResult?.people.find((person) => person.id === ids.personId)).toMatchObject({
      managerRole: "none",
      isStaff: true,
      hasManagerInvitation: false,
    });
  });

  it("店舗所属も管理者権限もないlegacy招待人物は一覧から隠し、再送情報は保持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_legacy_orphan_invitation",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "旧招待人物",
        email: "legacy-invitee@example.com",
        emailNormalized: "legacy-invitee@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "legacy-invitee@example.com",
        emailNormalized: "legacy-invitee@example.com",
        invitedName: "旧招待人物",
        tokenDigest: "legacy-issued-invitation-digest",
        status: "issued",
        targetPersonId: personId,
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_legacy_orphan_invitation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.personId)).toBeUndefined();
    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "pending",
      canResend: true,
      canRevoke: true,
    });
  });

  it.each([
    ["完全なdelayed pair + 期限あり", "pending", "email.delivery_delayed", "delivery_delayed", true],
    ["完全なdelayed pair + 期限なし", "sendFailed", "email.delivery_delayed", "delivery_delayed", false],
    ["delayed eventだけ", "sendFailed", "email.delivery_delayed", undefined, true],
    ["delayed statusだけ", "sendFailed", undefined, "delivery_delayed", true],
    ["delayed event + hard status", "sendFailed", "email.delivery_delayed", "failed", true],
    ["hard event + delayed status", "sendFailed", "email.failed", "delivery_delayed", true],
  ] as const)(
    "getSettingsはprovider状態が%sのとき管理者招待を%sへ投影する",
    async (_providerState, expectedStatus, providerEventType, deliveryStatus, withDeadline) => {
      const t = convexTest(schema, modules);
      const caseKey = `${providerEventType ?? "none"}-${deliveryStatus ?? "none"}-${withDeadline}`;
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: `settings_provider_pair_${caseKey}`,
          plan: "pro",
        });
        const now = Date.now();
        const invitationId = await ctx.db.insert("organizationInvitations", {
          organizationId: base.organizationId,
          email: `settings-provider-pair-${caseKey}@example.com`,
          emailNormalized: `settings-provider-pair-${caseKey}@example.com`,
          invitedName: "配送遅延中の招待対象者",
          tokenDigest: `settings-provider-pair-${caseKey}-digest`,
          status: "issued",
          inviterMemberId: base.memberId,
          reservedSeat: true,
          version: 1,
          expiresAt: now + 86_400_000,
          createdAt: now,
          updatedAt: now,
        });
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `organization-manager-invitation:settings-provider-pair-${caseKey}:1`,
          organizationId: base.organizationId,
          organizationInvitationId: invitationId,
          organizationInvitationVersion: 1,
          purpose: "business",
          payload: {
            kind: "organizationManagerInvitationEmail",
            from: "シフトリ <noreply@example.com>",
            to: `settings-provider-pair-${caseKey}@example.com`,
            context: "organizationInvitation.managerInvite",
          },
          attemptCount: 1,
          nextRunAt: now,
          sentAt: now,
          resendEmailId: `settings-provider-pair-${caseKey}`,
          ...(providerEventType ? { resendLastEventType: providerEventType } : {}),
          resendLastEventAt: now,
          ...(deliveryStatus ? { resendDeliveryStatus: deliveryStatus } : {}),
          createdAt: now,
          updatedAt: now,
        });
        if (withDeadline) {
          await ctx.db.insert("notificationResendDelayedFailureDeadlines", {
            outboxId,
            dueAt: now + 30 * 60_000,
            createdAt: now,
          });
        }
        return { ...base, invitationId };
      });

      const result = await t
        .withIdentity({ subject: `settings_provider_pair_${caseKey}` })
        .query(api.organization.queries.getSettings, { shopId: ids.shopId });

      expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
        status: expectedStatus,
        canResend: true,
        canRevoke: true,
      });
    },
  );

  it("無償BusinessをlegacyではBusiness、v2ではProの料金なしDTOへ投影する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "settings_complimentary_business",
        shopName: "無償Business店舗",
        complimentary: true,
      });
      await ctx.db.patch(seeded.organizationId, {
        migrationSourceShopId: seeded.shopId,
        updatedAt: Date.now(),
      });
      return seeded;
    });

    const result = await t
      .withIdentity({ subject: "settings_complimentary_business" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result).toMatchObject({
      canAddShop: true,
      billing: {
        state: "business",
        currentPlan: "business",
        isComplimentary: true,
        hasTrialContinuation: false,
        peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
        shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
        managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
        canManagePlan: false,
        canUpdatePaymentMethod: false,
        canUpdateBillingEmail: false,
        canScheduleFree: false,
      },
    });
    expect(result?.billing).not.toHaveProperty("nextEvent");
    expect(result?.billing.managePlanDisabledReason).toBeUndefined();
    expect(result?.billing.paymentMethodDisabledReason).toBeUndefined();
    expect(result?.billing.billingEmailDisabledReason).toBeUndefined();
    expect(result?.billing).not.toHaveProperty("migrationSourceShopId");
    expect(result?.billing).not.toHaveProperty("kind");

    const canonicalResult = await t
      .withIdentity({ subject: "settings_complimentary_business" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId, planIdVersion: 2 });
    expect(canonicalResult?.billing).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      isComplimentary: true,
      peopleUsage: { max: 50 },
      shopUsage: { max: 5 },
      managerUsage: { max: 5 },
    });
  });

  it("複数管理者のスタッフ兼任者には管理者権限だけを外すcapabilityを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_role_removal_actor",
        shopName: "権限設定店",
        plan: "pro",
      });
      const now = Date.now();
      const secondUserId = await seedUser(ctx, "settings_role_removal_target", "target@example.com");
      const secondPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: secondUserId,
        name: "スタッフ兼管理者",
        email: "target@example.com",
        emailNormalized: "target@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: secondPersonId,
        userId: secondUserId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: secondPersonId,
        name: "スタッフ兼管理者",
        email: "target@example.com",
        emailNormalized: "target@example.com",
        isDeleted: false,
      });
      return { ...base, secondPersonId };
    });

    const result = await t
      .withIdentity({ subject: "settings_role_removal_actor" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.secondPersonId)).toMatchObject({
      managerRole: "active",
      isStaff: true,
      canRemoveManagerRole: true,
    });
    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      canRemoveManagerRole: true,
    });
  });

  it("操作元店舗の状態に依存せず組織全体のDTOを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_archived_staff",
        shopName: "アーカイブ店",
        plan: "pro",
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "管理者",
        email: "settings_archived_staff@example.com",
        emailNormalized: "settings_archived_staff@example.com",
        isDeleted: false,
      });
      await ctx.db.patch(base.shopId, { operatingStatus: "archived" });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_archived_staff" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result).not.toHaveProperty("currentShopName");
    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      isStaff: true,
      shopNames: ["アーカイブ店"],
    });
    expect(result?.people.find((person) => person.id === ids.personId)).not.toHaveProperty("currentShopStaffId");
  });

  it("対象未固定の招待と同じメールの通常削除人物がいる場合は再利用可能な招待として表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_removed_invitee",
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "削除済み招待対象",
        email: "removed-invitee@example.com",
        emailNormalized: "removed-invitee@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        invitedName: "削除済み招待対象",
        email: "removed-invitee@example.com",
        emailNormalized: "removed-invitee@example.com",
        tokenDigest: "settings-removed-invitee-digest",
        status: "issued",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId };
    });

    const result = await t
      .withIdentity({ subject: "settings_removed_invitee" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "pending",
      canResend: true,
      canRevoke: true,
    });
  });

  it("対象未固定の招待と同じメールの人物が全statusで重複する場合はconflictとして再送を止める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_duplicate_invitee",
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "有効な招待対象",
        email: "duplicate-invitee@example.com",
        emailNormalized: "duplicate-invitee@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "削除済みの同一メール人物",
        email: "duplicate-invitee@example.com",
        emailNormalized: "duplicate-invitee@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        invitedName: "重複招待対象",
        email: "duplicate-invitee@example.com",
        emailNormalized: "duplicate-invitee@example.com",
        tokenDigest: "settings-duplicate-invitee-digest",
        status: "issued",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId };
    });

    const result = await t
      .withIdentity({ subject: "settings_duplicate_invitee" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "conflict",
      canResend: false,
      canRevoke: true,
    });
  });

  it("契約情報が未移行でもactive管理者には組織名変更を許可する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_migration_pending",
        shopName: "移行待ち店舗",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.delete(billingState._id);
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_migration_pending" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "migrationPending",
      currentPlan: null,
      isComplimentary: false,
      canManagePlan: false,
      managePlanDisabledReason: "設定の移行が完了するまでお待ちください。",
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "設定の移行が完了するまでお待ちください。",
      canUpdateBillingEmail: false,
      billingEmailDisabledReason: "設定の移行が完了するまでお待ちください。",
      canScheduleFree: false,
    });
    expect(result?.billing.blockedReason).toContain("移行");
    expect(result?.canUpdateOrganizationName).toBe(true);
    expect(result?.updateOrganizationNameDisabledReason).toBeUndefined();
    expect(result?.canAddShop).toBe(false);
    expect(result?.shops[0]).toMatchObject({ canDelete: false });
  });

  it("初回請求処理中はFree変更を案内しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_initial_payment_pending",
        shopName: "初回請求待ち店舗",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "initialPaymentPending", plan: "pro", startedAt: Date.now() },
        version: 2,
        updatedAt: Date.now(),
      });
      const now = Date.now();
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: base.organizationId,
        stripeCustomerId: "cus_settings_initial_payment_pending",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_initial_payment_pending" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "initialPaymentPending",
      canManagePlan: false,
      managePlanDisabledReason: "初回支払いの結果を確認中のため、プランを変更できません。",
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "初回支払いの結果を確認中です。\n確定後に、Stripeで支払い情報を管理できます。",
      canUpdateBillingEmail: true,
      canScheduleFree: false,
    });
  });

  it("Freeからの支払い結果待ちはFree基本権利と操作別の停止理由を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_pending_free",
        shopName: "Free支払い待ち店舗",
        plan: "free",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: Date.now() },
        version: 2,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_pending_free" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "pro",
      canManagePlan: false,
      managePlanDisabledReason: "支払い結果を確認中のため、別のプランへは変更できません。",
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "支払い結果を確認中です。\n確定後に、Stripeで支払い情報を管理できます。",
      canUpdateBillingEmail: true,
    });
    expect(result?.billing.blockedReason).toContain("無料の基本機能");
    expect(result?.billing.billingEmailDisabledReason).toBeUndefined();
    expect(result?.canUpdateOrganizationName).toBe(true);
  });

  it("将来シフトがある人物も削除確認へ進める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_future_assignment",
        shopName: "将来割当店",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "将来割当スタッフ",
        email: "future-assignment@example.com",
        emailNormalized: "future-assignment@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: personId,
        name: "将来割当スタッフ",
        email: "future-assignment@example.com",
        emailNormalized: "future-assignment@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: base.shopId,
        periodStart: "2099-01-01",
        periodEnd: "2099-01-15",
        deadline: "2098-12-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: now,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const positionId = await ctx.db.insert("positions", {
        shopId: base.shopId,
        name: "ホール",
        color: "#0f766e",
        sortOrder: 0,
        isDeleted: false,
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: "2099-01-03",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { ...base, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_future_assignment" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({ canRemove: true });
    expect(result?.people.find((person) => person.id === ids.personId)).not.toHaveProperty("removeDisabledReason");
    expect(result?.people.find((person) => person.id === ids.personId)).not.toHaveProperty("futureAssignments");
  });

  it("招待が100件を超えてもpendingを全件返し、履歴だけを100件に制限する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_invitation_history_limit",
        plan: "pro",
      });
      const now = Date.now();
      const pendingInvitationIds: Id<"organizationInvitations">[] = [];
      for (let index = 0; index < 101; index += 1) {
        pendingInvitationIds.push(
          await ctx.db.insert("organizationInvitations", {
            organizationId: base.organizationId,
            invitedName: `招待対象${index}`,
            email: `pending-${index}@example.com`,
            emailNormalized: `pending-${index}@example.com`,
            tokenDigest: `pending-digest-${index}`,
            status: "issued",
            inviterMemberId: base.memberId,
            reservedSeat: false,
            version: 1,
            expiresAt: now + 86_400_000,
            createdAt: now + index,
            updatedAt: now + index,
          }),
        );
      }
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("organizationInvitations", {
          organizationId: base.organizationId,
          invitedName: `取消対象${index}`,
          email: `revoked-${index}@example.com`,
          emailNormalized: `revoked-${index}@example.com`,
          tokenDigest: `revoked-digest-${index}`,
          status: "revoked",
          inviterMemberId: base.memberId,
          reservedSeat: false,
          version: 1,
          expiresAt: now - 1,
          revokedAt: now + index,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
      return { ...base, pendingInvitationIds };
    });

    const result = await t
      .withIdentity({ subject: "settings_invitation_history_limit" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations).toHaveLength(201);
    const returnedInvitationIds = new Set(result?.managerInvitations.map((invitation) => invitation.id));
    for (const invitationId of ids.pendingInvitationIds) {
      expect(returnedInvitationIds.has(invitationId)).toBe(true);
      expect(result?.managerInvitations.find((invitation) => invitation.id === invitationId)).toMatchObject({
        canRevoke: true,
      });
    }
    const pendingInvitationIdSet = new Set<string>(ids.pendingInvitationIds);
    expect(result?.managerInvitations.filter((invitation) => !pendingInvitationIdSet.has(invitation.id))).toHaveLength(
      100,
    );
  }, 15_000);

  it("別事業者のshopIdでは設定内容を返さない", async () => {
    const t = convexTest(schema, modules);
    const otherShopId = await t.run(async (ctx) => {
      await seedOrganizationManagerShop(ctx, { subject: "settings_idor_actor", plan: "pro" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "settings_idor_other", plan: "pro" });
      return other.shopId;
    });

    await expect(
      t
        .withIdentity({ subject: "settings_idor_actor" })
        .query(api.organization.queries.getSettings, { shopId: otherShopId }),
    ).resolves.toBeNull();
  });
});
