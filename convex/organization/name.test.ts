import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT } from "./service";

async function addCountedOrganizationPeople(
  t: TestConvex<typeof schema>,
  args: { organizationId: Id<"organizations">; shopId: Id<"shops">; count: number; suffix: string },
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < args.count; index += 1) {
      const email = `${args.suffix}-${String(index)}@example.com`;
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: args.organizationId,
        name: `利用者${String(index)}`,
        email,
        emailNormalized: email,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: args.shopId,
        organizationId: args.organizationId,
        organizationPersonId: personId,
        name: `利用者${String(index)}`,
        email,
        emailNormalized: email,
        isDeleted: false,
      });
    }
  });
}

async function overflowOrganizationPeopleProbe(
  t: TestConvex<typeof schema>,
  args: { organizationId: Id<"organizations">; suffix: string },
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT + 1; index += 1) {
      const email = `${args.suffix}-${String(index)}@example.com`;
      await ctx.db.insert("organizationPeople", {
        organizationId: args.organizationId,
        name: `未集計利用者${String(index)}`,
        email,
        emailNormalized: email,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

describe("organization.mutations.updateOrganizationName", () => {
  it("非稼働店舗を選択中でも事業者名を変更し、同じrequestIdを冪等に扱う", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_actor",
        shopName: "変更前店舗",
        plan: "pro",
      });
      await ctx.db.patch(base.shopId, { operatingStatus: "archived" });
      return base;
    });
    const requestId = "organization-name-request";
    const call = () =>
      t
        .withIdentity({ subject: "organization_name_actor" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "株式会社 変更後",
          requestId,
        });

    await expect(call()).resolves.toEqual({ changed: true });
    await expect(call()).resolves.toEqual({ changed: false });

    const requestKey = await toAuditRequestKey(requestId);
    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.get(ids.organizationId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:organization:name:${requestKey}`),
        )
        .collect(),
    }));
    expect(state.organization?.name).toBe("株式会社 変更後");
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: "organization.name_changed",
      fromState: "変更前店舗事業者",
      toState: "株式会社 変更後",
    });
    expect(state.audits[0]?.correlationId).not.toContain(requestId);
  });

  it("初期名のグループ接尾辞は編集時に外せる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_remove_suffix",
        shopName: "編集対象店舗",
        plan: "pro",
      });
      await ctx.db.patch(base.organizationId, { name: "編集対象店舗グループ" });
      return base;
    });

    await expect(
      t
        .withIdentity({ subject: "organization_name_remove_suffix" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "編集対象店舗",
          requestId: "organization-name-remove-suffix",
        }),
    ).resolves.toEqual({ changed: true });

    const organization = await t.run(async (ctx) => await ctx.db.get(ids.organizationId));
    expect(organization?.name).toBe("編集対象店舗");
  });

  it("閲覧のみ管理者による変更を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const readOnly = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_readonly",
        plan: "pro",
      });
      await ctx.db.patch(readOnly.memberId, { status: "readOnly" });
      return readOnly;
    });

    await expect(
      t
        .withIdentity({ subject: "organization_name_readonly" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "変更不可",
          requestId: "organization-name-readonly",
        }),
    ).rejects.toThrowError("Not found");
  });

  it("active Freeの利用上限超過中はlegacy入口からの組織名変更を拒否し、副作用を残さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "organization_name_over_limit",
          shopName: "上限超過前店舗",
          plan: "free",
        }),
    );
    await addCountedOrganizationPeople(t, {
      organizationId: ids.organizationId,
      shopId: ids.shopId,
      count: 5,
      suffix: "organization-name-over-limit",
    });

    await expect(
      t
        .withIdentity({ subject: "organization_name_over_limit" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "変更されない組織名",
          requestId: "organization-name-over-limit",
        }),
    ).rejects.toThrowError("現在のプラン上限を超えているため");

    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.get(ids.organizationId),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
    }));
    expect(state.organization?.name).toBe("上限超過前店舗事業者");
    expect(state.audits).toEqual([]);
  });

  it("active Proの利用数を安全に確定できない場合はlegacy入口からの組織名変更を拒否し、副作用を残さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "organization_name_usage_unknown",
          shopName: "利用数確認前店舗",
          plan: "pro",
        }),
    );
    await overflowOrganizationPeopleProbe(t, {
      organizationId: ids.organizationId,
      suffix: "organization-name-usage-unknown",
    });

    await expect(
      t
        .withIdentity({ subject: "organization_name_usage_unknown" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "変更されない組織名",
          requestId: "organization-name-usage-unknown",
        }),
    ).rejects.toThrowError("現在の利用数を安全に確認できないため");

    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.get(ids.organizationId),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
    }));
    expect(state.organization?.name).toBe("利用数確認前店舗事業者");
    expect(state.audits).toEqual([]);
  });

  it("契約制限中でもactive管理者は組織名を変更できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_restricted",
        plan: "pro",
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
      return base;
    });

    await expect(
      t
        .withIdentity({ subject: "organization_name_restricted" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "契約制限中の変更後グループ",
          requestId: "organization-name-restricted",
        }),
    ).resolves.toEqual({ changed: true });

    const organization = await t.run(async (ctx) => await ctx.db.get(ids.organizationId));
    expect(organization?.name).toBe("契約制限中の変更後グループ");
  });

  it("契約制限中からの支払い結果待ちでもactive管理者は組織名を変更できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_pending_restricted",
        plan: "pro",
      });
      const now = Date.now();
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "pendingActivation",
          plan: "business",
          fallback: "restricted",
          restrictedFallbackState: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [base.personId],
            previousActiveShopIds: [base.shopId],
            restrictedAt: now - 1_000,
          },
          startedAt: now,
        },
      });
      return base;
    });

    await expect(
      t
        .withIdentity({ subject: "organization_name_pending_restricted" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "支払い結果待ちの変更後グループ",
          requestId: "organization-name-pending-restricted",
        }),
    ).resolves.toEqual({ changed: true });

    const organization = await t.run(async (ctx) => await ctx.db.get(ids.organizationId));
    expect(organization?.name).toBe("支払い結果待ちの変更後グループ");
  });

  it("課金状態が未移行でもactive管理者は組織名を変更できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "organization_name_missing_billing",
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

    await expect(
      t
        .withIdentity({ subject: "organization_name_missing_billing" })
        .mutation(api.organization.mutations.updateOrganizationName, {
          shopId: ids.shopId,
          name: "課金移行中の変更後グループ",
          requestId: "organization-name-missing-billing",
        }),
    ).resolves.toEqual({ changed: true });

    const organization = await t.run(async (ctx) => await ctx.db.get(ids.organizationId));
    expect(organization?.name).toBe("課金移行中の変更後グループ");
  });
});
