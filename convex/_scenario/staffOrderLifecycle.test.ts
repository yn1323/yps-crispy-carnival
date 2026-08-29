import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const NOW = new Date("2026-08-20T00:00:00.000Z").getTime();

async function seedShop(ctx: MutationCtx, organizationId: Id<"organizations">, name: string) {
  return await ctx.db.insert("shops", {
    organizationId,
    name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
}

async function readOrderProjection(
  t: TestConvex<typeof schema>,
  args: { organizationId: Id<"organizations">; shopIds: Id<"shops">[] },
) {
  return await t.run(async (ctx) => ({
    revision: (
      await ctx.db
        .query("organizationStaffOrderStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique()
    )?.revision,
    people: await ctx.db
      .query("organizationStaffOrderEntries")
      .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", args.organizationId))
      .collect(),
    shops: await Promise.all(
      args.shopIds.map(async (shopId) => ({
        shopId,
        entries: await ctx.db
          .query("shopStaffOrderEntries")
          .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shopId))
          .collect(),
      })),
    ),
  }));
}

describe("スタッフ並び順のライフサイクルシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("組織順の有効化後も店舗所属の追加・解除と人物削除を同じ順位projectionへ反映する", async () => {
    const t = convexTest(schema, modules);
    const subject = "staff_order_lifecycle_manager";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject,
        email: "staff-order-lifecycle-manager@example.com",
        complimentary: true,
      });
      const secondaryShopId = await seedShop(ctx, base.organizationId, "並び順サブ店舗");
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "並び順対象スタッフ",
        email: "staff-order-lifecycle-target@example.com",
        emailNormalized: "staff-order-lifecycle-target@example.com",
        status: "active",
        createdAt: NOW + 1,
        updatedAt: NOW + 1,
      });
      await ctx.db.insert("staffs", {
        organizationId: base.organizationId,
        organizationPersonId: personId,
        shopId: base.shopId,
        name: "並び順対象スタッフ",
        email: "staff-order-lifecycle-target@example.com",
        emailNormalized: "staff-order-lifecycle-target@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      return {
        ...base,
        managerPersonId: base.personId,
        secondaryShopId,
        targetPersonId: personId,
      };
    });
    const actor = t.withIdentity({ subject });

    const editor = await actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor, {
      organizationId: ids.organizationId,
    });
    const activated = await actor.mutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder, {
      organizationId: ids.organizationId,
      orderedPersonIds: [ids.targetPersonId, ids.managerPersonId],
      expectedOrderFingerprint: editor.orderFingerprint,
    });
    expect(activated.revision).toBe(1);

    const initialDetail = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.shopId,
      personId: ids.targetPersonId,
      now: NOW,
    });
    if (!initialDetail) throw new Error("initial staff detail is missing");
    await expect(
      actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        desiredActiveShopIds: [ids.shopId, ids.secondaryShopId],
        expectedMembershipFingerprint: initialDetail.membershipFingerprint,
        removalPreviews: [],
        requestId: "staff-order-add-secondary-shop",
      }),
    ).resolves.toEqual({ changed: true, addedShopIds: [ids.secondaryShopId], removedShopIds: [] });

    const afterAddition = await readOrderProjection(t, {
      organizationId: ids.organizationId,
      shopIds: [ids.shopId, ids.secondaryShopId],
    });
    expect(afterAddition.revision).toBe(2);
    expect(
      afterAddition.shops.map(({ entries }) => entries.map(({ organizationPersonId }) => organizationPersonId)),
    ).toEqual([[ids.targetPersonId], [ids.targetPersonId]]);

    const detailBeforeRemoval = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.shopId,
      personId: ids.targetPersonId,
      now: NOW,
    });
    const primaryMembership = detailBeforeRemoval?.memberships.find(({ shopId }) => shopId === ids.shopId);
    if (!detailBeforeRemoval || primaryMembership?.removalPreview.kind !== "ready") {
      throw new Error("shop removal preview is missing");
    }
    await expect(
      actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        desiredActiveShopIds: [ids.secondaryShopId],
        expectedMembershipFingerprint: detailBeforeRemoval.membershipFingerprint,
        removalPreviews: [
          {
            shopId: ids.shopId,
            staffId: primaryMembership.staffId,
            assignmentCount: primaryMembership.removalPreview.assignmentCount,
            fingerprint: primaryMembership.removalPreview.fingerprint,
          },
        ],
        requestId: "staff-order-remove-primary-shop",
      }),
    ).resolves.toEqual({ changed: true, addedShopIds: [], removedShopIds: [ids.shopId] });

    const afterShopRemoval = await readOrderProjection(t, {
      organizationId: ids.organizationId,
      shopIds: [ids.shopId, ids.secondaryShopId],
    });
    expect(afterShopRemoval.revision).toBe(3);
    expect(afterShopRemoval.shops[0]?.entries).toEqual([]);
    expect(afterShopRemoval.shops[1]?.entries.map(({ organizationPersonId }) => organizationPersonId)).toEqual([
      ids.targetPersonId,
    ]);

    const detailBeforePersonRemoval = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.shopId,
      personId: ids.targetPersonId,
      now: NOW,
    });
    if (detailBeforePersonRemoval?.removalPreview.kind !== "ready") {
      throw new Error("organization removal preview is missing");
    }
    await expect(
      actor.mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        requestId: "staff-order-remove-person",
        removalPreview: {
          assignmentCount: detailBeforePersonRemoval.removalPreview.assignmentCount,
          fingerprint: detailBeforePersonRemoval.removalPreview.fingerprint,
        },
      }),
    ).resolves.toEqual({ changed: true });

    const afterPersonRemoval = await readOrderProjection(t, {
      organizationId: ids.organizationId,
      shopIds: [ids.shopId, ids.secondaryShopId],
    });
    expect(afterPersonRemoval.revision).toBe(4);
    expect(afterPersonRemoval.people.map(({ organizationPersonId }) => organizationPersonId)).toEqual([
      ids.managerPersonId,
    ]);
    expect(afterPersonRemoval.shops.every(({ entries }) => entries.length === 0)).toBe(true);
    await expect(t.run(async (ctx) => ctx.db.get(ids.targetPersonId))).resolves.toMatchObject({ status: "removed" });
  });
});
