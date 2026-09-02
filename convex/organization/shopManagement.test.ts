import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { seedLegacyShopMembership, seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getOrganizationUsageSnapshot } from "./service";

const submissionPattern = { kind: "time" as const, startTime: "09:00", endTime: "22:00" };

async function seedOrganizationShop(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    name: string;
  },
) {
  return await ctx.db.insert("shops", {
    organizationId: args.organizationId,
    name: args.name,
    submissionPattern,
    regularClosedDays: [],
    isDeleted: false,
  });
}

async function seedAdditionalManager(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    subject: string;
    status: "active" | "removed";
  },
) {
  const email = `${args.subject}@example.com`;
  const userId = await seedUser(ctx, args.subject, email);
  const now = Date.now();
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    userId,
    name: args.subject,
    email,
    emailNormalized: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const memberId = await ctx.db.insert("organizationMembers", {
    organizationId: args.organizationId,
    personId,
    userId,
    status: args.status,
    createdAt: now,
    updatedAt: now,
  });
  await seedLegacyShopMembership(ctx, { userId, shopId: args.shopId });
  return { memberId, personId, userId };
}

describe("organization shop management", () => {
  it("店舗追加は上限確認後に初期ポジション・監査を作成し、旧店舗所属を再生成しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "add_shop_actor",
        shopName: "既存店",
        plan: "standard",
      });
      const activeManager = await seedAdditionalManager(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        subject: "add_shop_active_manager",
        status: "active",
      });
      return { ...base, activeManager };
    });
    const asActor = t.withIdentity({ subject: "add_shop_actor" });

    const created = await asActor.mutation(api.organization.mutations.addShopForOrganization, {
      organizationId: ids.organizationId,
      shopName: "  新店舗  ",
      regularClosedDays: ["fri", "sun", "tue"],
      submissionPattern,
      requestId: "add-shop-request",
    });
    expect(created).toMatchObject({ changed: true });

    const requestKey = await toAuditRequestKey("add-shop-request");
    const state = await t.run(async (ctx) => ({
      shop: await ctx.db.get(created.shopId),
      positions: await ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", created.shopId).eq("isDeleted", false))
        .collect(),
      memberships: await ctx.db
        .query("shopMembers")
        .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", created.shopId).eq("isDeleted", false))
        .collect(),
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", `${ids.organizationId}:shop:add:${requestKey}`))
        .first(),
    }));
    expect(state.shop).toMatchObject({
      organizationId: ids.organizationId,
      name: "新店舗",
      regularClosedDays: ["sun", "tue", "fri"],
      submissionPattern,
      isDeleted: false,
    });
    expect(state.shop).not.toHaveProperty("operatingStatus");
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0]).toMatchObject({ isDefault: true, isDeleted: false });
    expect(state.memberships).toEqual([]);
    expect(state.audit).toMatchObject({ action: "organization.shop_added", targetId: created.shopId });

    await expect(
      asActor.mutation(api.organization.mutations.addShopForOrganization, {
        organizationId: ids.organizationId,
        shopName: "新店舗",
        regularClosedDays: ["fri", "sun", "tue"],
        submissionPattern,
        requestId: "add-shop-request",
      }),
    ).resolves.toEqual({ shopId: created.shopId, changed: false });
  });

  it("追加済み店舗が削除された後は同じrequestIdの再送で削除済み店舗を返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "add_deleted_shop_retry_actor",
        shopName: "既存店",
        plan: "standard",
      }),
    );
    const asActor = t.withIdentity({ subject: "add_deleted_shop_retry_actor" });
    const args = {
      organizationId: ids.organizationId,
      shopName: "削除予定店",
      regularClosedDays: [],
      submissionPattern,
      requestId: "add-deleted-shop-retry",
    };

    const created = await asActor.mutation(api.organization.mutations.addShopForOrganization, args);
    await t.run((ctx) => ctx.db.patch(created.shopId, { isDeleted: true }));

    await expect(asActor.mutation(api.organization.mutations.addShopForOrganization, args)).rejects.toThrow(
      "以前の操作結果を確認できません",
    );
  });

  it("未認証、removed、別組織の利用者は店舗を追加できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "add_shop_access_owner",
        shopName: "追加対象店",
        plan: "standard",
      });
      await seedAdditionalManager(ctx, {
        organizationId: target.organizationId,
        shopId: target.shopId,
        subject: "add_shop_removed",
        status: "removed",
      });
      await seedOrganizationManagerShop(ctx, { subject: "add_shop_other_org", plan: "standard" });
      return target;
    });
    const args = {
      organizationId: ids.organizationId,
      shopName: "作成されない店舗",
      regularClosedDays: [],
      submissionPattern,
      requestId: "unauthorized-add-shop",
    };

    await expect(t.mutation(api.organization.mutations.addShopForOrganization, args)).rejects.toThrow(
      "Unauthenticated",
    );
    await expect(
      t.withIdentity({ subject: "add_shop_removed" }).mutation(api.organization.mutations.addShopForOrganization, args),
    ).rejects.toThrow("Not found");
    await expect(
      t
        .withIdentity({ subject: "add_shop_other_org" })
        .mutation(api.organization.mutations.addShopForOrganization, args),
    ).rejects.toThrow("Not found");

    await expect(
      t.run((ctx) =>
        ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .collect(),
      ),
    ).resolves.toHaveLength(1);
  });

  it("アカウント削除受付済みuserがcanonical管理者に残る場合は店舗追加をtransactionごと拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "requested_add_shop_actor",
        shopName: "既存店",
        plan: "standard",
      });
      await ctx.db.patch(seeded.userId, { accountDeletionRequestedAt: Date.now() });
      return seeded;
    });

    await expect(
      t
        .withIdentity({ subject: "requested_add_shop_actor" })
        .mutation(api.organization.mutations.addShopForOrganization, {
          organizationId: ids.organizationId,
          shopName: "作成されない店舗",
          submissionPattern,
          regularClosedDays: [],
          requestId: "requested-add-shop",
        }),
    ).rejects.toThrow("管理者所属を確認できません");

    const state = await t.run(async (ctx) => ({
      shops: await ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      positions: await ctx.db.query("positions").collect(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(state.shops.map((shop) => shop._id)).toEqual([ids.shopId]);
    expect(state.positions).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("5店舗あるBusinessでは6店舗目を保存せず拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "sixth_shop", plan: "pro" });
      for (let index = 2; index <= 5; index += 1) {
        await seedOrganizationShop(ctx, { organizationId: base.organizationId, name: `店舗${index}` });
      }
      return base;
    });

    await expect(
      t.withIdentity({ subject: "sixth_shop" }).mutation(api.organization.mutations.addShopForOrganization, {
        organizationId: ids.organizationId,
        shopName: "6店舗目",
        regularClosedDays: [],
        submissionPattern,
        requestId: "sixth-shop-request",
      }),
    ).rejects.toThrow("店舗数が現在のプラン上限を超えます。");

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .collect(),
      ),
    ).resolves.toHaveLength(5);
  });

  it("Freeでは複数店舗機能から新店舗を追加できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "free_add_shop", plan: "free" }),
    );

    await expect(
      t.withIdentity({ subject: "free_add_shop" }).mutation(api.organization.mutations.addShopForOrganization, {
        organizationId: ids.organizationId,
        shopName: "Free追加店舗",
        regularClosedDays: [],
        submissionPattern,
        requestId: "free-add-shop",
      }),
    ).rejects.toThrow("この機能はトライアルまたはStandardで利用できます。");
  });

  describe("deleteShop", () => {
    const deadlineStateCases: Array<{
      label: string;
      buildState: (now: number, deadlineAt: number) => Doc<"organizationBillingStates">["state"];
    }> = [
      {
        label: "trial",
        buildState: (_now, deadlineAt) => ({ kind: "trial", trialEndsAt: deadlineAt }),
      },
      {
        label: "scheduledChange",
        buildState: (_now, deadlineAt) => ({
          kind: "scheduledChange",
          currentPlan: "standard",
          targetPlan: "free",
          effectiveAt: deadlineAt,
          restrictAtPeriodEnd: true,
        }),
      },
    ];

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("スタッフ所属がある組織店舗を即時削除し、同じrequestIdの再送では監査とcleanupを重複させない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_shop", plan: "standard" });
        const remainingShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "残す店舗",
        });
        const staffUserId = await seedUser(ctx, "delete_shop_staff_only", "shop-staff-user@example.com");
        const staffUserBefore = await ctx.db.get(staffUserId);
        if (!staffUserBefore) throw new Error("staff user not found");
        const now = Date.now();
        const staffPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          userId: staffUserId,
          name: "所属スタッフ",
          email: "shop-staff-user@example.com",
          emailNormalized: "shop-staff-user@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const staffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: staffPersonId,
          userId: staffUserId,
          name: "所属スタッフ",
          email: "shop-staff-user@example.com",
          emailNormalized: "shop-staff-user@example.com",
          isDeleted: false,
        });
        return { ...base, remainingShopId, staffId, staffUserId, staffUserBefore };
      });
      const asActor = t.withIdentity({ subject: "delete_shop" });
      const args = {
        expectedOrganizationId: ids.organizationId,
        shopId: ids.shopId,
        confirmShopId: ids.shopId,
        requestId: "delete-shop-request",
      };

      await expect(asActor.mutation(api.organization.mutations.deleteShop, args)).resolves.toEqual({
        shopId: ids.shopId,
        changed: true,
      });
      await expect(asActor.mutation(api.organization.mutations.deleteShop, args)).resolves.toEqual({
        shopId: ids.shopId,
        changed: false,
      });

      const requestKey = await toAuditRequestKey(args.requestId);
      const state = await t.run(async (ctx) => ({
        deletedShop: await ctx.db.get(ids.shopId),
        remainingShop: await ctx.db.get(ids.remainingShopId),
        staff: await ctx.db.get(ids.staffId),
        staffUser: await ctx.db.get(ids.staffUserId),
        usage: await getOrganizationUsageSnapshot(ctx, ids.organizationId),
        audits: await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_correlationId", (q) =>
            q.eq("correlationId", `${ids.organizationId}:shop:delete:${ids.shopId}:${requestKey}`),
          )
          .collect(),
        cleanupJobs: await ctx.db
          .query("deletionCleanupJobs")
          .withIndex("by_shopId_and_status", (q) => q.eq("shopId", ids.shopId).eq("status", "queued"))
          .collect(),
        scheduledKicks: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === "deletionCleanup/mutations:kick",
        ),
      }));
      expect(state.deletedShop).toMatchObject({ isDeleted: true, name: "テスト店舗" });
      expect(state.remainingShop?.isDeleted).toBe(false);
      expect(state.staff?.isDeleted).toBe(false);
      expect(state.staffUser).toEqual(ids.staffUserBefore);
      expect(state.usage.shopCount).toBe(1);
      expect(state.audits).toHaveLength(1);
      expect(state.audits[0]).toMatchObject({
        action: "organization.shop_deleted",
        actorUserId: ids.userId,
        targetKind: "shop",
        targetId: ids.shopId,
        toState: "deleted",
      });
      expect(state.cleanupJobs).toHaveLength(1);
      expect(state.cleanupJobs[0]).toMatchObject({
        scope: "shop",
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        requestId: requestKey,
        status: "queued",
        phase: "shopCore",
      });
      expect(state.scheduledKicks).toHaveLength(1);
      expect(state.scheduledKicks[0]?.args).toEqual([{ jobId: state.cleanupJobs[0]?._id }]);

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const cleaned = await t.run(async (ctx) => ({
        job: await ctx.db.get(state.cleanupJobs[0]._id),
        staff: await ctx.db.get(ids.staffId),
        staffUser: await ctx.db.get(ids.staffUserId),
      }));
      expect(cleaned.job?.status).toBe("completed");
      expect(cleaned.staff).toMatchObject({
        isDeleted: true,
        name: "所属スタッフ",
        email: "shop-staff-user@example.com",
        emailNormalized: "shop-staff-user@example.com",
      });
      expect(cleaned.staffUser).toEqual(ids.staffUserBefore);
    });

    it("2店舗を同時に削除してもOCCで必ず1店舗を残す", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_concurrently", plan: "standard" });
        const secondShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "第二店舗",
        });
        return { ...base, secondShopId };
      });
      const asActor = t.withIdentity({ subject: "delete_concurrently" });

      const results = await Promise.allSettled([
        asActor.mutation(api.organization.mutations.deleteShop, {
          expectedOrganizationId: ids.organizationId,
          shopId: ids.shopId,
          confirmShopId: ids.shopId,
          requestId: "delete-concurrently-first",
        }),
        asActor.mutation(api.organization.mutations.deleteShop, {
          expectedOrganizationId: ids.organizationId,
          shopId: ids.secondShopId,
          confirmShopId: ids.secondShopId,
          requestId: "delete-concurrently-second",
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const state = await t.run(async (ctx) => ({
        shops: await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .filter((q) => q.eq(q.field("isDeleted"), false))
          .collect(),
        cleanupJobs: await ctx.db.query("deletionCleanupJobs").collect(),
        scheduledKicks: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === "deletionCleanup/mutations:kick",
        ),
      }));
      expect(state.shops).toHaveLength(1);
      expect(state.cleanupJobs).toHaveLength(1);
      expect(state.cleanupJobs[0]).toMatchObject({ scope: "shop", status: "queued" });
      expect(state.cleanupJobs[0]?.shopId).not.toBe(state.shops[0]?._id);
      expect(state.scheduledKicks).toHaveLength(1);
      expect(state.scheduledKicks[0]?.args).toEqual([{ jobId: state.cleanupJobs[0]?._id }]);
    });

    it("最後の非削除店舗は削除しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(
        async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "delete_last_shop", plan: "standard" }),
      );

      await expect(
        t.withIdentity({ subject: "delete_last_shop" }).mutation(api.organization.mutations.deleteShop, {
          expectedOrganizationId: ids.organizationId,
          shopId: ids.shopId,
          confirmShopId: ids.shopId,
          requestId: "delete-last-shop",
        }),
      ).rejects.toThrow("最後の店舗は削除できません");

      const state = await t.run(async (ctx) => ({
        shop: await ctx.db.get(ids.shopId),
        audits: await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
          .filter((q) => q.eq(q.field("action"), "organization.shop_deleted"))
          .collect(),
        cleanupJobs: await ctx.db.query("deletionCleanupJobs").collect(),
      }));
      expect(state.shop?.isDeleted).toBe(false);
      expect(state.audits).toHaveLength(0);
      expect(state.cleanupJobs).toHaveLength(0);
    });

    it("確認対象と削除対象が一致しない場合は削除しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_confirm_mismatch", plan: "standard" });
        const otherShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "別店舗",
        });
        return { ...base, otherShopId };
      });

      await expect(
        t.withIdentity({ subject: "delete_confirm_mismatch" }).mutation(api.organization.mutations.deleteShop, {
          expectedOrganizationId: ids.organizationId,
          shopId: ids.shopId,
          confirmShopId: ids.otherShopId,
          requestId: "delete-confirm-mismatch",
        }),
      ).rejects.toThrow("Not found");
      await expect(t.run((ctx) => ctx.db.get(ids.shopId))).resolves.toMatchObject({ isDeleted: false });
    });

    it("Free対象店舗を削除し、参照をクリアして未削除の残存店舗を保持する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_free_shop", plan: "free" });
        const remainingShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "残存店舗",
        });
        return { ...base, remainingShopId };
      });

      await expect(
        t.withIdentity({ subject: "delete_free_shop" }).mutation(api.organization.mutations.deleteShop, {
          expectedOrganizationId: ids.organizationId,
          shopId: ids.shopId,
          confirmShopId: ids.shopId,
          requestId: "delete-free-shop",
        }),
      ).resolves.toEqual({ shopId: ids.shopId, changed: true });

      const state = await t.run(async (ctx) => ({
        deletedShop: await ctx.db.get(ids.shopId),
        remainingShop: await ctx.db.get(ids.remainingShopId),
        billingState: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
      }));
      expect(state.deletedShop?.isDeleted).toBe(true);
      expect(state.remainingShop).toMatchObject({ isDeleted: false });
      expect(state.billingState?.freeShopId).toBeUndefined();
      expect(state.billingState?.version).toBe(2);
    });

    it.each(deadlineStateCases)(
      "$labelの期限中にFree対象店舗を削除しても、更新後versionで同じ期限を再予約する",
      async ({ buildState }) => {
        const t = convexTest(schema, modules);
        const now = Date.parse("2026-08-01T00:00:00+09:00");
        const deadlineAt = now + 7 * 24 * 60 * 60 * 1000;
        vi.setSystemTime(now);
        const ids = await t.run(async (ctx) => {
          const base = await seedOrganizationManagerShop(ctx, { subject: "delete_deadline_shop", plan: "standard" });
          await seedOrganizationShop(ctx, {
            organizationId: base.organizationId,
            name: "期限後も残る店舗",
          });
          const billingState = await ctx.db
            .query("organizationBillingStates")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
            .unique();
          if (!billingState) throw new Error("billing state not found");
          await ctx.db.patch(billingState._id, {
            state: buildState(now, deadlineAt),
            freeShopId: base.shopId,
            version: 7,
            updatedAt: now,
          });
          await ctx.scheduler.runAt(deadlineAt, internal.organizationBilling.mutations.processDeadline, {
            organizationId: base.organizationId,
            expectedVersion: 7,
            expectedDeadlineAt: deadlineAt,
          });
          return { ...base, billingStateId: billingState._id };
        });

        await expect(
          t.withIdentity({ subject: "delete_deadline_shop" }).mutation(api.organization.mutations.deleteShop, {
            expectedOrganizationId: ids.organizationId,
            shopId: ids.shopId,
            confirmShopId: ids.shopId,
            requestId: "delete-deadline-shop",
          }),
        ).resolves.toEqual({ shopId: ids.shopId, changed: true });

        const state = await t.run(async (ctx) => ({
          billingState: await ctx.db.get(ids.billingStateId),
          deadlineJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
            (job) =>
              job.name === "organizationBilling/mutations:processDeadline" &&
              job.args[0]?.organizationId === ids.organizationId &&
              job.args[0]?.expectedDeadlineAt === deadlineAt,
          ),
        }));
        expect(state.billingState?.freeShopId).toBeUndefined();
        expect(state.billingState?.version).toBe(8);
        expect(
          state.deadlineJobs
            .map((job) => ({
              expectedVersion: job.args[0]?.expectedVersion,
              expectedDeadlineAt: job.args[0]?.expectedDeadlineAt,
              scheduledTime: job.scheduledTime,
            }))
            .sort((a, b) => (a.expectedVersion ?? 0) - (b.expectedVersion ?? 0)),
        ).toEqual([
          { expectedVersion: 7, expectedDeadlineAt: deadlineAt, scheduledTime: deadlineAt },
          { expectedVersion: 8, expectedDeadlineAt: deadlineAt, scheduledTime: deadlineAt },
        ]);
      },
    );

    it("未認証、removed管理者、別組織の管理者は店舗削除の副作用を開始しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const target = await seedOrganizationManagerShop(ctx, { subject: "delete_target_owner", plan: "standard" });
        await seedOrganizationShop(ctx, { organizationId: target.organizationId, name: "対象組織の残す店舗" });
        const removed = await seedAdditionalManager(ctx, {
          organizationId: target.organizationId,
          shopId: target.shopId,
          subject: "delete_removed",
          status: "removed",
        });
        await seedOrganizationManagerShop(ctx, { subject: "delete_other_organization", plan: "standard" });
        return { ...target, removed };
      });
      const args = {
        expectedOrganizationId: ids.organizationId,
        shopId: ids.shopId,
        confirmShopId: ids.shopId,
        requestId: "delete-shop-unauthorized",
      };
      const boundaryState = async () =>
        await t.run(async (ctx) => ({
          shop: await ctx.db.get(ids.shopId),
          audits: await ctx.db
            .query("organizationAuditEvents")
            .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
            .filter((q) => q.eq(q.field("action"), "organization.shop_deleted"))
            .collect(),
          cleanupJobs: await ctx.db.query("deletionCleanupJobs").collect(),
          scheduledFunctions: await ctx.db.system.query("_scheduled_functions").collect(),
        }));
      const before = await boundaryState();

      await expect(t.mutation(api.organization.mutations.deleteShop, args)).rejects.toThrow("Unauthenticated");
      await expect(
        t.withIdentity({ subject: "delete_removed" }).mutation(api.organization.mutations.deleteShop, args),
      ).rejects.toThrow("Not found");
      await expect(
        t.withIdentity({ subject: "delete_other_organization" }).mutation(api.organization.mutations.deleteShop, args),
      ).rejects.toThrow("Not found");
      expect(await boundaryState()).toEqual(before);
      expect(before.shop).toMatchObject({ isDeleted: false });
      expect(before.audits).toEqual([]);
      expect(before.cleanupJobs).toEqual([]);
      expect(before.scheduledFunctions).toEqual([]);
    });
  });
});
