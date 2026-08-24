import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedOrganizationManagerShop, seedOrganizationMembership, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getOrganizationUsageSnapshot } from "../organization/service";
import {
  getOrganizationAccessPolicy,
  requireOrganizationBusinessWrite,
  requireOrganizationBusinessWriteOrLimitRecoveryCapability,
  requireOrganizationCapacity,
} from "./service";

async function seedCountedStaff(ctx: MutationCtx, args: { shopId: Id<"shops">; count: number; prefix: string }) {
  const staffIds = [];
  for (let index = 0; index < args.count; index += 1) {
    staffIds.push(
      await seedStaff(ctx, {
        shopId: args.shopId,
        name: `${args.prefix}${index + 1}`,
        email: `${args.prefix}${index + 1}@example.com`,
      }),
    );
  }
  return staffIds;
}

async function seedActiveOrphanPeople(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; count: number; prefix: string },
) {
  const now = Date.now();
  for (let index = 0; index < args.count; index += 1) {
    const email = `${args.prefix}${index + 1}@example.com`;
    await ctx.db.insert("organizationPeople", {
      organizationId: args.organizationId,
      name: `${args.prefix}${index + 1}`,
      email,
      emailNormalized: email,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }
}

describe("organizationBilling/service access policy", () => {
  it("Trialは50名まで通常writeを許可し、51人目の追加を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_trial_pro",
        plan: "free",
      });
      await seedCountedStaff(ctx, { shopId: base.shopId, count: 49, prefix: "trial-pro-staff-" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", planIdVersion: 2, trialEndsAt: Date.now() + 60_000 },
      });
      return base;
    });

    const access = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(access).toMatchObject({
      accessMode: "normal",
      canWriteBusinessData: true,
      billingPolicy: {
        entitlementPlan: "pro",
        displayPlan: "trial",
        targetingPlan: "trial",
      },
      usageLimitStatus: {
        kind: "withinLimits",
        evaluatedPlan: "pro",
        usage: { peopleCount: 50, activeShopCount: 1, activeManagerCount: 1 },
        limits: { maxPeople: 50, maxActiveShops: 5, maxActiveManagers: 5 },
      },
    });
    await expect(
      t.run(async (ctx) => await requireOrganizationBusinessWrite(ctx, ids.organizationId)),
    ).resolves.toMatchObject({
      entitlementPlan: "pro",
      displayPlan: "trial",
      targetingPlan: "trial",
    });
    await expect(
      t.run(async (ctx) =>
        requireOrganizationCapacity(ctx, {
          organizationId: ids.organizationId,
          additionalPeople: 1,
        }),
      ),
    ).rejects.toThrow("利用人数が現在のプラン上限を超えます。\n現在50名、上限50名です。");
  });

  it.each([
    { label: "Standard", seed: { plan: "standard" as const, planIdVersion: 2 as const }, maxPeople: 25 },
    { label: "Pro", seed: { plan: "pro" as const, planIdVersion: 2 as const }, maxPeople: 50 },
    {
      label: "支払い不要Pro相当",
      seed: { complimentary: true as const, planIdVersion: 2 as const },
      maxPeople: 50,
    },
  ])("$labelは上限の1人前から1人追加でき、上限到達後の追加を拒否する", async ({ seed, maxPeople }) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: `usage_limit_people_boundary_${maxPeople}_${"complimentary" in seed ? "complimentary" : seed.plan}`,
        ...seed,
      });
      await seedCountedStaff(ctx, {
        shopId: base.shopId,
        count: maxPeople - 2,
        prefix: `usage-limit-boundary-${maxPeople}-`,
      });
      return base;
    });

    await expect(
      t.run(async (ctx) =>
        requireOrganizationCapacity(ctx, {
          organizationId: ids.organizationId,
          additionalPeople: 1,
        }),
      ),
    ).resolves.toBeDefined();

    await t.run(async (ctx) => {
      await seedCountedStaff(ctx, {
        shopId: ids.shopId,
        count: 1,
        prefix: `usage-limit-at-boundary-${maxPeople}-`,
      });
    });

    await expect(
      t.run(async (ctx) =>
        requireOrganizationCapacity(ctx, {
          organizationId: ids.organizationId,
          additionalPeople: 1,
        }),
      ),
    ).rejects.toThrow(`利用人数が現在のプラン上限を超えます。\n現在${maxPeople}名、上限${maxPeople}名です。`);
  });

  it("bounded probeで利用人数を確定できない場合は通常writeを閉じ、整理操作を許可する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_probe_unknown",
        plan: "free",
      });
      await seedActiveOrphanPeople(ctx, {
        organizationId: base.organizationId,
        count: 100,
        prefix: "unknown-person-",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      return { ...base, billingState };
    });

    const access = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(access).toMatchObject({
      accessMode: "limitRecoveryOnly",
      businessWriteBlockReason: "usageLimitExceeded",
      usageLimitStatus: {
        kind: "unknown",
        evaluatedPlan: "free",
        observedUsage: { peopleCount: 1, activeShopCount: 1, activeManagerCount: 1 },
        unknownDimensions: ["people"],
      },
    });
    await expect(
      t.run(async (ctx) => await requireOrganizationBusinessWrite(ctx, ids.organizationId)),
    ).rejects.toMatchObject({
      data: {
        code: "USAGE_LIMIT_EVALUATION_UNAVAILABLE",
        plan: "free",
        unknownDimensions: ["people"],
      },
    });
    await expect(
      t.run(async (ctx) =>
        requireOrganizationBusinessWriteOrLimitRecoveryCapability(ctx, {
          organizationId: ids.organizationId,
          personId: ids.personId,
          capability: "removeOrganizationPerson",
        }),
      ),
    ).resolves.toMatchObject({ entitlementPlan: "free" });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
      ),
    ).toEqual(ids.billingState);
  });

  it("scan overflow中でも観測範囲だけで超過を証明できれば下限付きoverLimitにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_probe_lower_bound",
        plan: "free",
      });
      await seedCountedStaff(ctx, { shopId: base.shopId, count: 5, prefix: "lower-bound-staff-" });
      await seedActiveOrphanPeople(ctx, {
        organizationId: base.organizationId,
        count: 95,
        prefix: "lower-bound-orphan-",
      });
      return base;
    });

    const access = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(access?.usageLimitStatus).toMatchObject({
      kind: "overLimit",
      violations: [{ kind: "people", current: 6, max: 5, excess: 1, isLowerBound: true }],
    });
  });

  it("削除済みのactive-status店舗履歴はbounded probeのoverflowへ含めない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_deleted_active_shop_history",
        plan: "free",
      });
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: `削除済み店舗${index + 1}`,
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          isDeleted: true,
        });
      }
      return base;
    });

    const access = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));

    expect(access).toMatchObject({
      accessMode: "normal",
      canWriteBusinessData: true,
      usageLimitStatus: {
        kind: "withinLimits",
        evaluatedPlan: "free",
        usage: { peopleCount: 1, activeShopCount: 1, activeManagerCount: 1 },
      },
    });
    expect(access?.usageProbe).toEqual({
      usage: { peopleCount: 1, activeManagerCount: 1, activeShopCount: 1 },
      unknownDimensions: [],
      lowerBoundDimensions: [],
    });
  });

  it("m025互換のstatus欠損店舗を実効activeとして追加判定と通常write guardの双方で数える", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_legacy_active_shop",
        plan: "standard",
        planIdVersion: 2,
      });
      for (let index = 0; index < 3; index += 1) {
        await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: `稼働店舗${index + 2}`,
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          isDeleted: false,
        });
      }
      await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        name: "status欠損店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
      return base;
    });

    await expect(
      t.run(async (ctx) => await getOrganizationUsageSnapshot(ctx, ids.organizationId)),
    ).resolves.toMatchObject({ activeShopCount: 5 });
    await expect(
      t.run(async (ctx) =>
        requireOrganizationCapacity(ctx, {
          organizationId: ids.organizationId,
          additionalActiveShops: 1,
        }),
      ),
    ).rejects.toThrow("店舗数が現在のプラン上限を超えます。");

    await t.run(async (ctx) => {
      await ctx.db.insert("shops", {
        organizationId: ids.organizationId,
        operatingStatus: "active",
        name: "上限超過店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
    });
    const access = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(access?.usageLimitStatus).toMatchObject({
      kind: "overLimit",
      usage: { activeShopCount: 6 },
      violations: [{ kind: "activeShops", current: 6, max: 5, excess: 1 }],
    });
    await expect(
      t.run(async (ctx) => await requireOrganizationBusinessWrite(ctx, ids.organizationId)),
    ).rejects.toMatchObject({
      data: {
        code: "USAGE_LIMIT_EXCEEDED",
        plan: "standard",
        violations: [{ kind: "activeShops", current: 6, max: 5, excess: 1 }],
      },
    });
  });

  it("本人性が壊れたactive membership rowを有効管理者数へ含めない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_invalid_active_managers",
        plan: "standard",
        planIdVersion: 2,
      });
      for (let index = 0; index < 2; index += 1) {
        const userId = await seedUser(ctx, `usage_limit_valid_manager_${index + 1}`);
        await seedOrganizationMembership(ctx, { userId, shopId: base.shopId });
      }

      const now = Date.now();
      const insertPerson = async (args: { userId: Id<"users">; subject: string; status?: "active" | "removed" }) => {
        const email = `${args.subject}@example.com`;
        return await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          userId: args.userId,
          name: args.subject,
          email,
          emailNormalized: email,
          status: args.status ?? "active",
          createdAt: now,
          updatedAt: now,
        });
      };
      const insertActiveMember = async (personId: Id<"organizationPeople">, userId: Id<"users">) =>
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId,
          userId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });

      const deletedUserId = await seedUser(ctx, "usage_limit_deleted_manager_user");
      const deletedUserPersonId = await insertPerson({
        userId: deletedUserId,
        subject: "usage_limit_deleted_manager_user",
      });
      await insertActiveMember(deletedUserPersonId, deletedUserId);
      await ctx.db.patch(deletedUserId, { isDeleted: true });

      const personOwnerUserId = await seedUser(ctx, "usage_limit_mismatched_manager_person");
      const memberOwnerUserId = await seedUser(ctx, "usage_limit_mismatched_manager_member");
      const mismatchedPersonId = await insertPerson({
        userId: personOwnerUserId,
        subject: "usage_limit_mismatched_manager_person",
      });
      await insertActiveMember(mismatchedPersonId, memberOwnerUserId);

      const removedPersonUserId = await seedUser(ctx, "usage_limit_removed_manager_person");
      const removedPersonId = await insertPerson({
        userId: removedPersonUserId,
        subject: "usage_limit_removed_manager_person",
        status: "removed",
      });
      await insertActiveMember(removedPersonId, removedPersonUserId);

      return base;
    });

    await expect(
      t.run(async (ctx) => await getOrganizationUsageSnapshot(ctx, ids.organizationId)),
    ).resolves.toMatchObject({
      personCount: 3,
      activeManagerCount: 3,
      projectedActiveManagerCount: 3,
    });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_status", (q) =>
            q.eq("organizationId", ids.organizationId).eq("status", "active"),
          )
          .collect(),
      ),
    ).resolves.toHaveLength(6);
    const access = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(access).toMatchObject({
      accessMode: "normal",
      canWriteBusinessData: true,
      usageLimitStatus: {
        kind: "withinLimits",
        evaluatedPlan: "standard",
        usage: { peopleCount: 3, activeShopCount: 1, activeManagerCount: 3 },
      },
      usageProbe: {
        usage: { peopleCount: 3, activeShopCount: 1, activeManagerCount: 3 },
        unknownDimensions: [],
        lowerBoundDimensions: [],
      },
    });
    await expect(
      t.run(async (ctx) => await requireOrganizationBusinessWrite(ctx, ids.organizationId)),
    ).resolves.toMatchObject({ entitlementPlan: "standard" });
  });

  it("active.freeの実数超過を導出し、通常writeを件数だけのstructured errorで拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_free",
        plan: "free",
      });
      await seedCountedStaff(ctx, { shopId: base.shopId, count: 5, prefix: "staff" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      return { ...base, billingState };
    });

    const access = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(access).not.toBeNull();
    expect(access?.accessMode).toBe("limitRecoveryOnly");
    expect(access?.businessWriteBlockReason).toBe("usageLimitExceeded");
    expect(access?.usageLimitStatus).toEqual({
      kind: "overLimit",
      evaluatedPlan: "free",
      usage: { peopleCount: 6, activeShopCount: 1, activeManagerCount: 1 },
      limits: { maxPeople: 5, maxActiveShops: 1, maxActiveManagers: 2 },
      violations: [{ kind: "people", current: 6, max: 5, excess: 1 }],
    });

    await expect(
      t.run(async (ctx) => await requireOrganizationBusinessWrite(ctx, ids.organizationId)),
    ).rejects.toMatchObject({
      data: {
        code: "USAGE_LIMIT_EXCEEDED",
        plan: "free",
        violations: [{ kind: "people", current: 6, max: 5, excess: 1 }],
      },
    });

    const persistedBillingState = await t.run(async (ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(persistedBillingState).toEqual(ids.billingState);
  });

  it("未承認招待の予約枠は組織全体の上限超過に含めず、実数を減らすとstate更新なしで復旧する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "usage_limit_recovery",
        plan: "free",
      });
      const staffIds = await seedCountedStaff(ctx, { shopId: base.shopId, count: 5, prefix: "recover" });
      const staffToRemove = await ctx.db.get(staffIds[0]);
      if (!staffToRemove?.organizationPersonId) throw new Error("seeded staff must have an organization person");
      const now = Date.now();
      await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "pending@example.com",
        emailNormalized: "pending@example.com",
        invitedName: "招待中",
        tokenDigest: "pending-invitation-digest",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      return { ...base, personIdToRemove: staffToRemove.organizationPersonId, billingState };
    });

    const overLimit = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(overLimit?.accessMode).toBe("limitRecoveryOnly");
    await expect(
      t.run(async (ctx) => await getOrganizationUsageSnapshot(ctx, ids.organizationId)),
    ).resolves.toMatchObject({
      personCount: 6,
      projectedPersonCount: 7,
      reservedSeatCount: 1,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.personIdToRemove, { status: "removed", updatedAt: Date.now() });
    });

    const recovered = await t.run(async (ctx) => await getOrganizationAccessPolicy(ctx, ids.organizationId));
    expect(recovered?.accessMode).toBe("normal");
    expect(recovered?.usageLimitStatus).toMatchObject({
      kind: "withinLimits",
      evaluatedPlan: "free",
      usage: { peopleCount: 5 },
    });
    await expect(
      t.run(async (ctx) => await getOrganizationUsageSnapshot(ctx, ids.organizationId)),
    ).resolves.toMatchObject({
      personCount: 5,
      projectedPersonCount: 6,
      reservedSeatCount: 1,
    });
    await expect(
      t.run(async (ctx) => await requireOrganizationBusinessWrite(ctx, ids.organizationId)),
    ).resolves.toMatchObject({
      entitlementPlan: "free",
    });

    const persistedBillingState = await t.run(async (ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(persistedBillingState).toEqual(ids.billingState);
  });
});
