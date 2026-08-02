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
    status?: "active" | "archived" | "planSuspended";
  },
) {
  return await ctx.db.insert("shops", {
    organizationId: args.organizationId,
    operatingStatus: args.status ?? "active",
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
    status: "active" | "readOnly";
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
  // ダークローンチ中は既定で閉じている。以降のテストは公開済みの契約を検証する。
  beforeEach(() => vi.stubEnv("FEATURE_SHOP_ADDITION", "enabled"));
  afterEach(() => vi.unstubAllEnvs());

  it("店舗追加は上限確認後に初期ポジション・監査を作成し、旧店舗所属を再生成しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "add_shop_actor",
        shopName: "既存店",
        plan: "pro",
      });
      const activeManager = await seedAdditionalManager(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        subject: "add_shop_active_manager",
        status: "active",
      });
      const readOnlyManager = await seedAdditionalManager(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        subject: "add_shop_readonly_manager",
        status: "readOnly",
      });
      return { ...base, activeManager, readOnlyManager };
    });
    const asActor = t.withIdentity({ subject: "add_shop_actor" });

    const created = await asActor.mutation(api.organization.mutations.addShop, {
      shopId: ids.shopId,
      shopName: "  新店舗  ",
      regularClosedDays: ["fri", "sun", "tue"],
      submissionPattern,
      requestId: "add-shop-request",
    });
    expect(created).toMatchObject({ changed: true, shopStatus: "active" });

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
      operatingStatus: "active",
      name: "新店舗",
      regularClosedDays: ["sun", "tue", "fri"],
      submissionPattern,
      isDeleted: false,
    });
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0]).toMatchObject({ isDefault: true, isDeleted: false });
    expect(state.memberships).toEqual([]);
    expect(state.audit).toMatchObject({ action: "organization.shop_added", targetId: created.shopId });

    await expect(
      asActor.mutation(api.organization.mutations.addShop, {
        shopId: ids.shopId,
        shopName: "新店舗",
        regularClosedDays: ["fri", "sun", "tue"],
        submissionPattern,
        requestId: "add-shop-request",
      }),
    ).resolves.toEqual({ shopId: created.shopId, shopStatus: "active", changed: false });
  });

  it("アカウント削除受付済みuserがcanonical管理者に残る場合は店舗追加をtransactionごと拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "requested_add_shop_actor",
        shopName: "既存店",
        plan: "pro",
      });
      await ctx.db.patch(seeded.userId, { accountDeletionRequestedAt: Date.now() });
      return seeded;
    });

    await expect(
      t.withIdentity({ subject: "requested_add_shop_actor" }).mutation(api.organization.mutations.addShop, {
        shopId: ids.shopId,
        shopName: "作成されない店舗",
        submissionPattern,
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

  it.each(["archived", "planSuspended"] as const)(
    "%s店舗を選択中でも有効管理者は事業者へ新店舗を追加できる",
    async (operatingStatus) => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: `inactive_add_shop_${operatingStatus}`,
          plan: "pro",
        });
        await ctx.db.patch(base.shopId, { operatingStatus });
        return base;
      });

      const created = await t
        .withIdentity({ subject: `inactive_add_shop_${operatingStatus}` })
        .mutation(api.organization.mutations.addShop, {
          shopId: ids.shopId,
          shopName: `${operatingStatus}から追加`,
          submissionPattern,
          requestId: `inactive-add-${operatingStatus}`,
        });
      await expect(t.run((ctx) => ctx.db.get(created.shopId))).resolves.toMatchObject({
        organizationId: ids.organizationId,
        operatingStatus: "active",
        regularClosedDays: [],
        isDeleted: false,
      });
    },
  );

  it("5店舗稼働中のBusinessでは6店舗目を保存せず拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "sixth_shop", plan: "business" });
      for (let index = 2; index <= 5; index += 1) {
        await seedOrganizationShop(ctx, { organizationId: base.organizationId, name: `稼働店${index}` });
      }
      return base;
    });

    await expect(
      t.withIdentity({ subject: "sixth_shop" }).mutation(api.organization.mutations.addShop, {
        shopId: ids.shopId,
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
      t.withIdentity({ subject: "free_add_shop" }).mutation(api.organization.mutations.addShop, {
        shopId: ids.shopId,
        shopName: "Free追加店舗",
        regularClosedDays: [],
        submissionPattern,
        requestId: "free-add-shop",
      }),
    ).rejects.toThrow("この機能はトライアルまたはProで利用できます。");
  });

  it("ダークローンチ中は、上限に空きがあっても店舗を追加できない", async () => {
    vi.stubEnv("FEATURE_SHOP_ADDITION", "");
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "dark_launch_add_shop", plan: "pro" }),
    );

    await expect(
      t.withIdentity({ subject: "dark_launch_add_shop" }).mutation(api.organization.mutations.addShop, {
        shopId: ids.shopId,
        shopName: "未公開中の追加店舗",
        regularClosedDays: [],
        submissionPattern,
        requestId: "dark-launch-add-shop",
      }),
    ).rejects.toThrow("店舗の追加は現在ご利用いただけません");

    const state = await t.run(async (ctx) => ({
      shops: await ctx.db.query("shops").collect(),
      positions: await ctx.db.query("positions").collect(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .filter((q) => q.eq(q.field("action"), "organization.shop_added"))
        .collect(),
    }));
    expect(state.shops).toHaveLength(1);
    expect(state.positions).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("アーカイブは履歴を削除せず、同じrequestIdを再実行しても監査を重複作成しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "archive_shop", plan: "pro" });
      const staffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "管理者",
        email: "archive_shop@example.com",
        emailNormalized: "archive_shop@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: base.shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-07",
        deadline: "2026-06-30",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        submissionPattern,
        isDeleted: false,
      });
      return { ...base, recruitmentId, staffId };
    });
    const asActor = t.withIdentity({ subject: "archive_shop" });

    await expect(
      asActor.mutation(api.organization.mutations.archiveShop, {
        shopId: ids.shopId,
        requestId: "archive-shop-request",
      }),
    ).resolves.toEqual({ shopId: ids.shopId, shopStatus: "archived", changed: true });
    await expect(
      asActor.mutation(api.organization.mutations.archiveShop, {
        shopId: ids.shopId,
        requestId: "archive-shop-request",
      }),
    ).resolves.toEqual({ shopId: ids.shopId, shopStatus: "archived", changed: false });

    const requestKey = await toAuditRequestKey("archive-shop-request");
    const state = await t.run(async (ctx) => ({
      shop: await ctx.db.get(ids.shopId),
      staff: await ctx.db.get(ids.staffId),
      recruitment: await ctx.db.get(ids.recruitmentId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:shop:archive:${ids.shopId}:${requestKey}`),
        )
        .collect(),
    }));
    expect(state.shop).toMatchObject({ operatingStatus: "archived", isDeleted: false });
    expect(state.staff).toMatchObject({ isDeleted: false });
    expect(state.recruitment).toMatchObject({ isDeleted: false });
    expect(state.audits).toHaveLength(1);
  });

  it("別事業者の管理者は店舗IDを知っていてもアーカイブできない", async () => {
    const t = convexTest(schema, modules);
    const targetShopId = await t.run(async (ctx) => {
      await seedOrganizationManagerShop(ctx, { subject: "archive_idor_actor", plan: "pro" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "archive_idor_target", plan: "pro" });
      return other.shopId;
    });

    await expect(
      t.withIdentity({ subject: "archive_idor_actor" }).mutation(api.organization.mutations.archiveShop, {
        shopId: targetShopId,
        requestId: "archive-idor-request",
      }),
    ).rejects.toThrow("Not found");
  });

  it("契約制限中は復旧担当者だけがアーカイブでき、誰も再稼働できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "recovery_archive", plan: "pro" });
      const other = await seedAdditionalManager(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        subject: "non_recovery_archive",
        status: "active",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [base.personId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: Date.now(),
        },
      });
      return { ...base, other };
    });

    await expect(
      t.withIdentity({ subject: "non_recovery_archive" }).mutation(api.organization.mutations.archiveShop, {
        shopId: ids.shopId,
        requestId: "non-recovery-archive",
      }),
    ).rejects.toThrow("この復旧操作を行う権限がありません");
    await expect(
      t.withIdentity({ subject: "recovery_archive" }).mutation(api.organization.mutations.archiveShop, {
        shopId: ids.shopId,
        requestId: "recovery-archive",
      }),
    ).resolves.toEqual({ shopId: ids.shopId, shopStatus: "archived", changed: true });
    await expect(
      t.withIdentity({ subject: "recovery_archive" }).mutation(api.organization.mutations.reactivateShop, {
        shopId: ids.shopId,
        requestId: "restricted-reactivate",
      }),
    ).rejects.toThrow("契約制限中は店舗を再稼働できません");
  });

  it("再稼働時に店舗上限を再確認し、空きができた後だけ稼働へ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "reactivate_capacity", plan: "business" });
      const targetShopId = await seedOrganizationShop(ctx, {
        organizationId: base.organizationId,
        name: "再稼働対象",
        status: "archived",
      });
      const activeShopIds: Id<"shops">[] = [];
      for (let index = 2; index <= 5; index += 1) {
        activeShopIds.push(
          await seedOrganizationShop(ctx, { organizationId: base.organizationId, name: `稼働店${index}` }),
        );
      }
      return { ...base, activeShopIds, targetShopId };
    });
    const asActor = t.withIdentity({ subject: "reactivate_capacity" });

    await expect(
      asActor.mutation(api.organization.mutations.reactivateShop, {
        shopId: ids.targetShopId,
        requestId: "reactivate-at-capacity",
      }),
    ).rejects.toThrow("店舗数が現在のプラン上限を超えます。");

    await t.run(async (ctx) => await ctx.db.patch(ids.activeShopIds[0], { operatingStatus: "archived" }));
    await expect(
      asActor.mutation(api.organization.mutations.reactivateShop, {
        shopId: ids.targetShopId,
        requestId: "reactivate-after-space",
      }),
    ).resolves.toEqual({ shopId: ids.targetShopId, shopStatus: "active", changed: true });
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
          currentPlan: "pro",
          targetPlan: "free",
          effectiveAt: deadlineAt,
        }),
      },
      {
        label: "grace",
        buildState: (now, deadlineAt) => ({
          kind: "grace",
          plan: "pro",
          startedAt: now - 1_000,
          endsAt: deadlineAt,
        }),
      },
    ];

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("スタッフ所属がある組織店舗を即時削除し、同じrequestIdの再送では監査とcleanupを重複させない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_shop", plan: "pro" });
        const remainingShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "残す店舗",
        });
        const staffUserId = await seedUser(ctx, "delete_shop_staff_only", "shop-staff-user@example.com");
        const staffUserBefore = await ctx.db.get(staffUserId);
        if (!staffUserBefore) throw new Error("staff user not found");
        const staffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
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
      expect(state.usage.activeShopCount).toBe(1);
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
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_concurrently", plan: "pro" });
        const secondShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "第二店舗",
        });
        return { ...base, secondShopId };
      });
      const asActor = t.withIdentity({ subject: "delete_concurrently" });

      const results = await Promise.allSettled([
        asActor.mutation(api.organization.mutations.deleteShop, {
          shopId: ids.shopId,
          confirmShopId: ids.shopId,
          requestId: "delete-concurrently-first",
        }),
        asActor.mutation(api.organization.mutations.deleteShop, {
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
        async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "delete_last_shop", plan: "pro" }),
      );

      await expect(
        t.withIdentity({ subject: "delete_last_shop" }).mutation(api.organization.mutations.deleteShop, {
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
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_confirm_mismatch", plan: "pro" });
        const otherShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "別店舗",
        });
        return { ...base, otherShopId };
      });

      await expect(
        t.withIdentity({ subject: "delete_confirm_mismatch" }).mutation(api.organization.mutations.deleteShop, {
          shopId: ids.shopId,
          confirmShopId: ids.otherShopId,
          requestId: "delete-confirm-mismatch",
        }),
      ).rejects.toThrow("Not found");
      await expect(t.run((ctx) => ctx.db.get(ids.shopId))).resolves.toMatchObject({ isDeleted: false });
    });

    it("Freeで残す店舗も削除し、参照をクリアして残存店舗を自動再稼働しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_free_shop", plan: "free" });
        const remainingShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "停止中の残存店舗",
          status: "planSuspended",
        });
        return { ...base, remainingShopId };
      });

      await expect(
        t.withIdentity({ subject: "delete_free_shop" }).mutation(api.organization.mutations.deleteShop, {
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
      expect(state.remainingShop).toMatchObject({ isDeleted: false, operatingStatus: "planSuspended" });
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
          const base = await seedOrganizationManagerShop(ctx, { subject: "delete_deadline_shop", plan: "pro" });
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

    it("契約制限中は復旧担当の有効管理者だけが店舗を削除できる", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject: "delete_recovery", plan: "pro" });
        const remainingShopId = await seedOrganizationShop(ctx, {
          organizationId: base.organizationId,
          name: "復旧後も残す店舗",
        });
        await seedAdditionalManager(ctx, {
          organizationId: base.organizationId,
          shopId: base.shopId,
          subject: "delete_non_recovery",
          status: "active",
        });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "freeConditionsNotMet",
            previousPlan: "pro",
            recoveryManagerPersonIds: [base.personId],
            previousActiveShopIds: [base.shopId, remainingShopId],
            restrictedAt: Date.now(),
          },
        });
        return base;
      });
      const args = {
        shopId: ids.shopId,
        confirmShopId: ids.shopId,
        requestId: "delete-restricted-shop",
      };

      await expect(
        t.withIdentity({ subject: "delete_non_recovery" }).mutation(api.organization.mutations.deleteShop, args),
      ).rejects.toThrow("この復旧操作を行う権限がありません");
      await expect(
        t.withIdentity({ subject: "delete_recovery" }).mutation(api.organization.mutations.deleteShop, args),
      ).resolves.toEqual({ shopId: ids.shopId, changed: true });
    });

    it("閲覧のみの管理者と別組織の管理者は店舗を削除できない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const target = await seedOrganizationManagerShop(ctx, { subject: "delete_target_owner", plan: "pro" });
        await seedOrganizationShop(ctx, { organizationId: target.organizationId, name: "対象組織の残す店舗" });
        const readOnly = await seedAdditionalManager(ctx, {
          organizationId: target.organizationId,
          shopId: target.shopId,
          subject: "delete_readonly",
          status: "readOnly",
        });
        await seedOrganizationManagerShop(ctx, { subject: "delete_other_organization", plan: "pro" });
        return { ...target, readOnly };
      });
      const args = {
        shopId: ids.shopId,
        confirmShopId: ids.shopId,
        requestId: "delete-shop-unauthorized",
      };

      await expect(
        t.withIdentity({ subject: "delete_readonly" }).mutation(api.organization.mutations.deleteShop, args),
      ).rejects.toThrow("Not found");
      await expect(
        t.withIdentity({ subject: "delete_other_organization" }).mutation(api.organization.mutations.deleteShop, args),
      ).rejects.toThrow("Not found");
      await expect(t.run((ctx) => ctx.db.get(ids.shopId))).resolves.toMatchObject({ isDeleted: false });
    });
  });
});
