import type { FunctionReturnType, PaginationResult } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  getOrganizationStaffOrderEditorSnapshot,
  getOrganizationStaffOrderSourceSnapshot,
  ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT,
  saveOrganizationStaffOrderSnapshot,
  syncActivatedOrganizationStaffOrder,
} from "../organization/staffOrder";

type OrganizationPersonListItem = FunctionReturnType<
  typeof api.appOrganization.queries.listOrganizationPeople
>["page"][number];

async function insertPerson(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    name: string;
    index: number;
    shopIds?: Id<"shops">[];
  },
) {
  const email = `staff-order-${args.index}@example.com`;
  const now = Date.parse("2026-08-20T00:00:00Z") + args.index;
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    name: args.name,
    email,
    emailNormalized: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const staffIds: Id<"staffs">[] = [];
  for (const shopId of args.shopIds ?? []) {
    staffIds.push(
      await ctx.db.insert("staffs", {
        organizationId: args.organizationId,
        organizationPersonId: personId,
        shopId,
        name: args.name,
        email,
        emailNormalized: email,
        isDeleted: false,
      }),
    );
  }
  return { personId, staffIds };
}

async function getAllOrganizationPersonIds(
  actor: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  args: {
    organizationId: Id<"organizations">;
    orderRevision: number | null;
    shopFilter?: "all" | Id<"shops">;
  },
) {
  const ids: Id<"organizationPeople">[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
    const page: PaginationResult<OrganizationPersonListItem> = await actor.query(
      api.appOrganization.queries.listOrganizationPeople,
      {
        organizationId: args.organizationId,
        shopFilter: args.shopFilter ?? "all",
        orderRevision: args.orderRevision,
        paginationOpts: { numItems: 2, cursor },
      },
    );
    ids.push(...page.page.map((person) => person.id));
    if (page.isDone) return ids;
    cursor = page.continueCursor;
  }
  throw new Error("organization people pagination did not finish");
}

async function activateOrder(
  actor: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  organizationId: Id<"organizations">,
  orderedPersonIds: Id<"organizationPeople">[],
) {
  const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
    organizationId,
  });
  return await actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
    organizationId,
    orderedPersonIds,
    expectedOrderFingerprint: editor.orderFingerprint,
  });
}

describe("organization staff order", () => {
  it("新public APIは未認証・別事業者actorを拒否し、order documentを作らない", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_authorized_actor";
    const ids = await t.run(async (ctx) => ({
      base: await seedOrganizationManagerShop(ctx, { subject, complimentary: true }),
      other: await seedOrganizationManagerShop(ctx, {
        subject: "staff_order_other_tenant_actor",
        complimentary: true,
      }),
    }));
    const editor = await t
      .withIdentity({ subject })
      .query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
        organizationId: ids.base.organizationId,
      });
    const saveArgs = {
      organizationId: ids.base.organizationId,
      orderedPersonIds: [ids.base.personId],
      expectedOrderFingerprint: editor.orderFingerprint,
    };

    await expect(
      t.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
        organizationId: ids.base.organizationId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope, {
        organizationId: ids.base.organizationId,
        shopFilter: "all",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, saveArgs),
    ).rejects.toThrow("Unauthenticated");

    const otherActor = t.withIdentity({ subject: "staff_order_other_tenant_actor" });
    await expect(
      otherActor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
        organizationId: ids.base.organizationId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      otherActor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope, {
        organizationId: ids.base.organizationId,
        shopFilter: "all",
      }),
    ).rejects.toThrow("Not found");
    await expect(
      otherActor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, saveArgs),
    ).rejects.toThrow("Not found");

    await expect(
      t.run(async (ctx) => ({
        states: await ctx.db.query("organizationStaffOrderStates").collect(),
        organizationEntries: await ctx.db.query("organizationStaffOrderEntries").collect(),
        shopEntries: await ctx.db.query("shopStaffOrderEntries").collect(),
      })),
    ).resolves.toEqual({ states: [], organizationEntries: [], shopEntries: [] });
  });

  it("組織順を保存し、組織・店舗・Dashboardのnative paginationで同じ部分列を返す", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_pagination";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const first = await insertPerson(ctx, {
        organizationId: base.organizationId,
        name: "一郎",
        index: 1,
        shopIds: [base.shopId],
      });
      const second = await insertPerson(ctx, {
        organizationId: base.organizationId,
        name: "二郎",
        index: 2,
        shopIds: [base.shopId],
      });
      const third = await insertPerson(ctx, {
        organizationId: base.organizationId,
        name: "三郎",
        index: 3,
        shopIds: [base.shopId],
      });
      return { base, first, second, third };
    });
    const actor = t.withIdentity({ subject });
    const orderedPersonIds = [ids.third.personId, ids.base.personId, ids.first.personId, ids.second.personId];
    const saved = await activateOrder(actor, ids.base.organizationId, orderedPersonIds);
    expect(saved).toMatchObject({ changed: true, revision: 1 });

    await expect(
      actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope, {
        organizationId: ids.base.organizationId,
        shopFilter: "all",
      }),
    ).resolves.toEqual({ mode: "ordered", revision: saved.revision });
    await expect(
      getAllOrganizationPersonIds(actor, {
        organizationId: ids.base.organizationId,
        orderRevision: saved.revision,
      }),
    ).resolves.toEqual(orderedPersonIds);
    const oldClientPage = await actor.query(api.appOrganization.queries.listOrganizationPeople, {
      organizationId: ids.base.organizationId,
      shopFilter: "all",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(oldClientPage.page.map((person) => person.id)).toEqual([
      ids.base.personId,
      ids.first.personId,
      ids.second.personId,
      ids.third.personId,
    ]);
    await expect(
      getAllOrganizationPersonIds(actor, {
        organizationId: ids.base.organizationId,
        shopFilter: ids.base.shopId,
        orderRevision: saved.revision,
      }),
    ).resolves.toEqual([ids.third.personId, ids.first.personId, ids.second.personId]);

    await expect(
      actor.query(api.dashboard.queries.getDashboardStaffOrderScope, {
        shopId: ids.base.shopId,
        expectedOrganizationId: ids.base.organizationId,
      }),
    ).resolves.toEqual({ mode: "ordered", revision: saved.revision });
    const dashboard = await actor.query(api.dashboard.queries.getDashboardStaffs, {
      shopId: ids.base.shopId,
      expectedOrganizationId: ids.base.organizationId,
      orderRevision: saved.revision,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(dashboard.page.map((staff) => staff.organizationPersonId)).toEqual([
      ids.third.personId,
      ids.first.personId,
      ids.second.personId,
    ]);

    const firstManagerSnapshot = await actor.query(
      api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor,
      { organizationId: ids.base.organizationId },
    );
    const secondManagerSnapshot = await actor.query(
      api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor,
      { organizationId: ids.base.organizationId },
    );
    await actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
      organizationId: ids.base.organizationId,
      orderedPersonIds: [...orderedPersonIds].reverse(),
      expectedOrderFingerprint: firstManagerSnapshot.orderFingerprint,
    });
    await expect(
      actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
        organizationId: ids.base.organizationId,
        orderedPersonIds,
        expectedOrderFingerprint: secondManagerSnapshot.orderFingerprint,
      }),
    ).rejects.toThrow("スタッフ情報が変更されています");
  });

  it("source変更後の古いfingerprintを拒否し、失敗時にorder documentを作らない", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_stale";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const first = await insertPerson(ctx, {
        organizationId: base.organizationId,
        name: "一郎",
        index: 1,
        shopIds: [base.shopId],
      });
      return { base, first };
    });
    const actor = t.withIdentity({ subject });
    const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
      organizationId: ids.base.organizationId,
    });
    await t.run(
      async (ctx) =>
        await insertPerson(ctx, {
          organizationId: ids.base.organizationId,
          name: "追加",
          index: 2,
          shopIds: [ids.base.shopId],
        }),
    );
    await expect(
      actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
        organizationId: ids.base.organizationId,
        orderedPersonIds: [ids.first.personId, ids.base.personId],
        expectedOrderFingerprint: editor.orderFingerprint,
      }),
    ).rejects.toThrow("スタッフ情報が変更されています");
    await expect(
      t.run(async (ctx) => ({
        states: await ctx.db.query("organizationStaffOrderStates").collect(),
        organizationEntries: await ctx.db.query("organizationStaffOrderEntries").collect(),
        shopEntries: await ctx.db.query("shopStaffOrderEntries").collect(),
      })),
    ).resolves.toEqual({ states: [], organizationEntries: [], shopEntries: [] });
  });

  it("duplicate・missing・extra・foreign person IDを拒否し、1人の正しい集合だけ保存する", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_person_set";
    const ids = await t.run(async (ctx) => ({
      base: await seedOrganizationManagerShop(ctx, { subject, complimentary: true }),
      other: await seedOrganizationManagerShop(ctx, { subject: `${subject}_other`, complimentary: true }),
    }));
    const actor = t.withIdentity({ subject });
    const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
      organizationId: ids.base.organizationId,
    });
    const invalidOrders = [
      [ids.base.personId, ids.base.personId],
      [],
      [ids.other.personId],
      [ids.base.personId, ids.other.personId],
    ];
    await expect(
      actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
        organizationId: ids.base.organizationId,
        orderedPersonIds: [ids.base.personId],
        expectedOrderFingerprint: "invalid",
      }),
    ).rejects.toThrow("並び順の確認情報が不正です");
    for (const orderedPersonIds of invalidOrders) {
      await expect(
        actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
          organizationId: ids.base.organizationId,
          orderedPersonIds,
          expectedOrderFingerprint: editor.orderFingerprint,
        }),
      ).rejects.toThrow();
    }
    await expect(t.run(async (ctx) => await ctx.db.query("organizationStaffOrderStates").collect())).resolves.toEqual(
      [],
    );

    const saved = await actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
      organizationId: ids.base.organizationId,
      orderedPersonIds: [ids.base.personId],
      expectedOrderFingerprint: editor.orderFingerprint,
    });
    await expect(
      actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
        organizationId: ids.base.organizationId,
        orderedPersonIds: [ids.base.personId],
        expectedOrderFingerprint: saved.orderFingerprint,
      }),
    ).resolves.toMatchObject({ changed: false, revision: saved.revision });
  });

  it("0人の境界でも空orderをtransaction内で有効化する", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "空の事業者",
        billingEmail: "empty-order@example.com",
        billingEmailNormalized: "empty-order@example.com",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const editor = await getOrganizationStaffOrderEditorSnapshot(ctx, organizationId);
      const saved = await saveOrganizationStaffOrderSnapshot(ctx, {
        organizationId,
        orderedPersonIds: [],
        expectedOrderFingerprint: editor.orderFingerprint,
      });
      return {
        saved,
        states: (await ctx.db.query("organizationStaffOrderStates").collect()).length,
        entries: (await ctx.db.query("organizationStaffOrderEntries").collect()).length,
      };
    });
    expect(result).toMatchObject({ saved: { changed: true, revision: 1 }, states: 1, entries: 0 });
  });

  it("欠損entryではlegacyへfallbackし、古いordered cursor familyは空でscope resetを待つ", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_fallback";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const first = await insertPerson(ctx, {
        organizationId: base.organizationId,
        name: "一郎",
        index: 1,
        shopIds: [base.shopId],
      });
      return { base, first };
    });
    const actor = t.withIdentity({ subject });
    const saved = await activateOrder(actor, ids.base.organizationId, [ids.first.personId, ids.base.personId]);
    await t.run(async (ctx) => {
      const entry = await ctx.db
        .query("organizationStaffOrderEntries")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", ids.base.organizationId).eq("organizationPersonId", ids.first.personId),
        )
        .unique();
      if (!entry) throw new Error("order entry not found");
      await ctx.db.delete(entry._id);
    });

    await expect(
      actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope, {
        organizationId: ids.base.organizationId,
        shopFilter: "all",
      }),
    ).resolves.toEqual({ mode: "legacy" });
    await expect(
      actor.query(api.appOrganization.queries.listOrganizationPeople, {
        organizationId: ids.base.organizationId,
        shopFilter: "all",
        orderRevision: saved.revision,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).resolves.toEqual({ page: [], isDone: true, continueCursor: "" });
    await expect(
      getAllOrganizationPersonIds(actor, {
        organizationId: ids.base.organizationId,
        orderRevision: null,
      }),
    ).resolves.toEqual([ids.base.personId, ids.first.personId]);
  });

  it("店舗entryのforeign不整合ではlegacyへ戻り、スタッフを欠落させない", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_shop_foreign";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const person = await insertPerson(ctx, {
        organizationId: base.organizationId,
        name: "一郎",
        index: 1,
        shopIds: [base.shopId],
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: `${subject}_other`,
        complimentary: true,
      });
      return { base, person, other };
    });
    const actor = t.withIdentity({ subject });
    const saved = await activateOrder(actor, ids.base.organizationId, [ids.person.personId, ids.base.personId]);
    await t.run(async (ctx) => {
      const entry = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_staffId", (q) =>
          q.eq("shopId", ids.base.shopId).eq("staffId", ids.person.staffIds[0]),
        )
        .unique();
      if (!entry) throw new Error("shop order entry not found");
      await ctx.db.patch(entry._id, { organizationId: ids.other.organizationId });
    });
    await expect(
      actor.query(api.dashboard.queries.getDashboardStaffOrderScope, {
        shopId: ids.base.shopId,
        expectedOrganizationId: ids.base.organizationId,
      }),
    ).resolves.toEqual({ mode: "legacy" });
    await expect(
      actor.query(api.dashboard.queries.getDashboardStaffs, {
        shopId: ids.base.shopId,
        expectedOrganizationId: ids.base.organizationId,
        orderRevision: saved.revision,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).resolves.toEqual({ page: [], isDone: true, continueCursor: "" });
    const legacy = await actor.query(api.dashboard.queries.getDashboardStaffs, {
      shopId: ids.base.shopId,
      expectedOrganizationId: ids.base.organizationId,
      orderRevision: null,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(legacy.page.map((staff) => staff._id)).toEqual(ids.person.staffIds);
  });

  it("active order中の新規人物を既存順位の末尾へ同期する", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_sync_append";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const first = await insertPerson(ctx, {
        organizationId: base.organizationId,
        name: "一郎",
        index: 1,
        shopIds: [base.shopId],
      });
      return { base, first };
    });
    const actor = t.withIdentity({ subject });
    await activateOrder(actor, ids.base.organizationId, [ids.first.personId, ids.base.personId]);
    const added = await t.run(async (ctx) => {
      const person = await insertPerson(ctx, {
        organizationId: ids.base.organizationId,
        name: "追加",
        index: 2,
        shopIds: [ids.base.shopId],
      });
      const result = await syncActivatedOrganizationStaffOrder(ctx, { organizationId: ids.base.organizationId });
      return { ...person, result };
    });
    expect(added.result).toBe("synced");
    const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
      organizationId: ids.base.organizationId,
    });
    expect(editor.people.map((person) => person.personId)).toEqual([
      ids.first.personId,
      ids.base.personId,
      added.personId,
    ]);
  });

  it("50人×5稼働店舗を一transactionで有効化し、最大301 documentを構築する", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_maximum";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const shopIds = [base.shopId];
      for (let index = 1; index < 5; index += 1) {
        shopIds.push(
          await ctx.db.insert("shops", {
            organizationId: base.organizationId,
            operatingStatus: "active",
            name: `店舗${index + 1}`,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: false,
          }),
        );
      }
      const personIds = [base.personId];
      for (let index = 1; index < ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT; index += 1) {
        personIds.push(
          (
            await insertPerson(ctx, {
              organizationId: base.organizationId,
              name: `スタッフ${index}`,
              index,
              shopIds,
            })
          ).personId,
        );
      }
      // 管理者も全店舗のスタッフとしてcanonical linkし、50人×5店舗を満たす。
      const actorPerson = await ctx.db.get(base.personId);
      if (!actorPerson) throw new Error("actor person not found");
      for (const shopId of shopIds) {
        await ctx.db.insert("staffs", {
          organizationId: base.organizationId,
          organizationPersonId: base.personId,
          shopId,
          name: actorPerson.name,
          email: actorPerson.email,
          emailNormalized: actorPerson.emailNormalized,
          isDeleted: false,
        });
      }
      return { base, personIds };
    });
    const actor = t.withIdentity({ subject });
    const saved = await activateOrder(actor, ids.base.organizationId, [...ids.personIds].reverse());
    expect(saved).toMatchObject({ changed: true, revision: 1 });
    await expect(
      t.run(async (ctx) => ({
        states: (await ctx.db.query("organizationStaffOrderStates").collect()).length,
        organizationEntries: (await ctx.db.query("organizationStaffOrderEntries").collect()).length,
        shopEntries: (await ctx.db.query("shopStaffOrderEntries").collect()).length,
      })),
    ).resolves.toEqual({ states: 1, organizationEntries: 50, shopEntries: 250 });
  });

  it.each([
    { label: "active", operatingStatus: "active" as const },
    { label: "operatingStatus欠損", operatingStatus: undefined },
  ])(
    "deleted $label shopがscan上限を超えた場合は一部sourceを採用せずfail closedする",
    async ({ label, operatingStatus }) => {
      const t = convexTest(schema, modules);
      const subject = `staff_order_deleted_shop_scan_${label}`;
      const base = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
        for (let index = 0; index <= ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT; index += 1) {
          await ctx.db.insert("shops", {
            organizationId: seeded.organizationId,
            ...(operatingStatus ? { operatingStatus } : {}),
            name: `削除済み店舗${index}`,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: true,
          });
        }
        return seeded;
      });
      const actor = t.withIdentity({ subject });

      const source = await t.run(
        async (ctx) => await getOrganizationStaffOrderSourceSnapshot(ctx, base.organizationId),
      );
      expect(source.availability).toBe("legacyDataIncomplete");
      expect("snapshot" in source).toBe(false);

      const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
        organizationId: base.organizationId,
      });
      expect(editor).toMatchObject({ availability: "legacyDataIncomplete", canWrite: false, people: [] });
      await expect(
        actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
          organizationId: base.organizationId,
          orderedPersonIds: [base.personId],
          expectedOrderFingerprint: editor.orderFingerprint,
        }),
      ).rejects.toThrow("並び順を保存できる状態ではありません");
      await expect(
        t.run(async (ctx) => ({
          states: await ctx.db.query("organizationStaffOrderStates").collect(),
          organizationEntries: await ctx.db.query("organizationStaffOrderEntries").collect(),
          shopEntries: await ctx.db.query("shopStaffOrderEntries").collect(),
        })),
      ).resolves.toEqual({ states: [], organizationEntries: [], shopEntries: [] });
    },
  );

  it("正規の5稼働店舗と少数のdeleted shopは完全に読み分けてreadyを維持する", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_deleted_shop_bounded_ready";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      const activeShopIds = [base.shopId];
      for (let index = 1; index < 5; index += 1) {
        activeShopIds.push(
          await ctx.db.insert("shops", {
            organizationId: base.organizationId,
            ...(index === 4 ? {} : { operatingStatus: "active" as const }),
            name: `稼働店舗${index + 1}`,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: false,
          }),
        );
      }
      for (const operatingStatus of ["active" as const, undefined]) {
        for (let index = 0; index < 2; index += 1) {
          await ctx.db.insert("shops", {
            organizationId: base.organizationId,
            ...(operatingStatus ? { operatingStatus } : {}),
            name: `削除済み${operatingStatus ?? "legacy"}${index}`,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: true,
          });
        }
      }
      return { base, activeShopIds };
    });

    const source = await t.run(
      async (ctx) => await getOrganizationStaffOrderSourceSnapshot(ctx, ids.base.organizationId),
    );
    expect(source.availability).toBe("ready");
    if (source.availability !== "ready") throw new Error("staff order source is not ready");
    expect(source.snapshot.activeShops.map(({ shop }) => shop._id).sort()).toEqual([...ids.activeShopIds].sort());

    const editor = await t
      .withIdentity({ subject })
      .query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
        organizationId: ids.base.organizationId,
      });
    expect(editor).toMatchObject({ availability: "ready", canWrite: true });
    expect(editor.people.map((person) => person.personId)).toEqual([ids.base.personId]);
  });

  it.each([
    { kind: "people" as const, expected: "tooManyPeople" as const },
    { kind: "shops" as const, expected: "tooManyActiveShops" as const },
    { kind: "unlinked" as const, expected: "legacyDataIncomplete" as const },
  ])("$kindの安全上限・legacy不整合では部分一覧を返さず有効化しない", async ({ kind, expected }) => {
    const t = convexTest(schema, modules);
    const subject = `staff_order_unavailable_${kind}`;
    const base = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
      if (kind === "people") {
        for (let index = 1; index <= ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT; index += 1) {
          await insertPerson(ctx, { organizationId: seeded.organizationId, name: `人物${index}`, index });
        }
      } else if (kind === "shops") {
        for (let index = 1; index <= 5; index += 1) {
          await ctx.db.insert("shops", {
            organizationId: seeded.organizationId,
            operatingStatus: "active",
            name: `追加店舗${index}`,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: false,
          });
        }
      } else {
        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          name: "未移行スタッフ",
          email: "legacy@example.com",
          emailNormalized: "legacy@example.com",
          isDeleted: false,
        });
      }
      return seeded;
    });
    const editor = await t
      .withIdentity({ subject })
      .query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
        organizationId: base.organizationId,
      });
    expect(editor).toMatchObject({ availability: expected, canWrite: false, people: [] });
  });

  it("readOnly管理者と契約制限中の管理者は保存できない", async () => {
    const t = convexTest(schema, modules);
    const readOnlySubject = "staff_order_read_only";
    const restrictedSubject = "staff_order_restricted";
    const ids = await t.run(async (ctx) => {
      const readOnly = await seedOrganizationManagerShop(ctx, { subject: readOnlySubject, complimentary: true });
      const restricted = await seedOrganizationManagerShop(ctx, { subject: restrictedSubject, complimentary: true });
      await ctx.db.patch(readOnly.memberId, { status: "readOnly", updatedAt: Date.now() });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", restricted.organizationId))
        .unique();
      if (!billing) throw new Error("billing state not found");
      await ctx.db.patch(billing._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "business",
          recoveryManagerPersonIds: [restricted.personId],
          previousActiveShopIds: [restricted.shopId],
          restrictedAt: Date.now(),
        },
      });
      return { readOnly, restricted };
    });
    for (const [subject, base] of [
      [readOnlySubject, ids.readOnly],
      [restrictedSubject, ids.restricted],
    ] as const) {
      const actor = t.withIdentity({ subject });
      const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
        organizationId: base.organizationId,
      });
      expect(editor.canWrite).toBe(false);
      await expect(
        actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
          organizationId: base.organizationId,
          orderedPersonIds: [base.personId],
          expectedOrderFingerprint: editor.orderFingerprint,
        }),
      ).rejects.toThrow();
    }
    await expect(
      t.withIdentity({ subject: restrictedSubject }).query(api.appOrganization.queries.getOrganizationPeopleSummary, {
        organizationId: ids.restricted.organizationId,
        shopFilter: "all",
      }),
    ).resolves.toMatchObject({
      canChangeStaffOrder: false,
      changeStaffOrderDisabledReason: "契約状態を復旧してからスタッフの並び順を変更できます。",
    });
  });

  it("active.freeの実数上限超過中は事業者共通の並び順を保存しない", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_usage_limit";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, plan: "free" });
      const people = [];
      for (let index = 1; index <= 5; index += 1) {
        people.push(
          await insertPerson(ctx, {
            organizationId: base.organizationId,
            name: `上限超過人物${index}`,
            index: 100 + index,
            shopIds: [base.shopId],
          }),
        );
      }
      return { ...base, people };
    });
    const actor = t.withIdentity({ subject });
    const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
      organizationId: ids.organizationId,
    });
    const before = await t.run(async (ctx) => ({
      states: await ctx.db.query("organizationStaffOrderStates").collect(),
      entries: await ctx.db.query("organizationStaffOrderEntries").collect(),
    }));

    await expect(
      actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
        organizationId: ids.organizationId,
        orderedPersonIds: [ids.personId, ...ids.people.map((person) => person.personId)],
        expectedOrderFingerprint: editor.orderFingerprint,
      }),
    ).rejects.toMatchObject({ data: { code: "USAGE_LIMIT_EXCEEDED", plan: "free" } });

    const after = await t.run(async (ctx) => ({
      states: await ctx.db.query("organizationStaffOrderStates").collect(),
      entries: await ctx.db.query("organizationStaffOrderEntries").collect(),
    }));
    expect(after).toEqual(before);
  });
});
