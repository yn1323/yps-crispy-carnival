import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { seedOrganizationManagerShop, seedShopMembership, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

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
  await seedShopMembership(ctx, { userId, shopId: args.shopId });
  return { memberId, personId, userId };
}

describe("organization shop management", () => {
  it("店舗追加は上限確認後に事業者所属・初期ポジション・全管理者の互換所属・監査を一括作成する", async () => {
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
      isDeleted: false,
    });
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0]).toMatchObject({ isDefault: true, isDeleted: false });
    expect(new Set(state.memberships.map((membership) => membership.userId))).toEqual(
      new Set([ids.userId, ids.activeManager.userId, ids.readOnlyManager.userId]),
    );
    expect(state.audit).toMatchObject({ action: "organization.shop_added", targetId: created.shopId });

    await expect(
      asActor.mutation(api.organization.mutations.addShop, {
        shopId: ids.shopId,
        shopName: "新店舗",
        submissionPattern,
        requestId: "add-shop-request",
      }),
    ).resolves.toEqual({ shopId: created.shopId, shopStatus: "active", changed: false });
  });

  it.each([
    "archived",
    "planSuspended",
  ] as const)("%s店舗を選択中でも有効管理者は事業者へ新店舗を追加できる", async (operatingStatus) => {
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
      isDeleted: false,
    });
  });

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
        submissionPattern,
        requestId: "sixth-shop-request",
      }),
    ).rejects.toThrow("稼働店舗数が現在のプラン上限を超えます");

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
        submissionPattern,
        requestId: "free-add-shop",
      }),
    ).rejects.toThrow("この機能は無料体験、Pro、Businessで利用できます");
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
    ).rejects.toThrow("稼働店舗数が現在のプラン上限を超えます");

    await t.run(async (ctx) => await ctx.db.patch(ids.activeShopIds[0], { operatingStatus: "archived" }));
    await expect(
      asActor.mutation(api.organization.mutations.reactivateShop, {
        shopId: ids.targetShopId,
        requestId: "reactivate-after-space",
      }),
    ).resolves.toEqual({ shopId: ids.targetShopId, shopStatus: "active", changed: true });
  });
});
