import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { deletedLineUserId } from "../deletionCleanup/tombstone";

const NOW = Date.parse("2026-10-01T12:00:00+09:00");
const submissionPattern = { kind: "time" as const, startTime: "09:00", endTime: "22:00" };

describe("組織削除シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("複数店舗と100件超の人物を中断後に完走し、global userを維持して同じ認証主体で再設定できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "organization_deletion_owner",
        shopName: "削除対象店A",
        complimentary: true,
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: target.organizationId,
        operatingStatus: "active",
        name: "削除対象店B",
        submissionPattern,
        regularClosedDays: [],
        isDeleted: false,
      });

      const personIds: Id<"organizationPeople">[] = [];
      const staffIds: Id<"staffs">[] = [];
      const lineAccountIds: Id<"staffLineAccounts">[] = [];
      for (let index = 0; index < 105; index += 1) {
        const shopId = index % 2 === 0 ? target.shopId : secondShopId;
        const email = `bulk-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: target.organizationId,
          name: `一括スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          organizationId: target.organizationId,
          organizationPersonId: personId,
          name: `一括スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
        const lineAccountId = await ctx.db.insert("staffLineAccounts", {
          staffId,
          shopId,
          lineUserId: `line-bulk-${index}`,
          linkedAt: NOW,
          following: true,
          isDeleted: false,
        });
        personIds.push(personId);
        staffIds.push(staffId);
        lineAccountIds.push(lineAccountId);
      }

      const sharedUserId = await seedUser(ctx, "organization_deletion_shared", "shared-before@example.com");
      const sharedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: target.organizationId,
        userId: sharedUserId,
        name: "共有スタッフ",
        email: "shared-before@example.com",
        emailNormalized: "shared-before@example.com",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const sharedStaffId = await ctx.db.insert("staffs", {
        shopId: target.shopId,
        organizationId: target.organizationId,
        organizationPersonId: sharedPersonId,
        userId: sharedUserId,
        name: "共有スタッフ",
        email: "shared-before@example.com",
        emailNormalized: "shared-before@example.com",
        isDeleted: false,
      });
      const sharedLineAccountId = await ctx.db.insert("staffLineAccounts", {
        staffId: sharedStaffId,
        shopId: target.shopId,
        lineUserId: "line-shared-before",
        linkedAt: NOW,
        following: true,
        isDeleted: false,
      });
      personIds.push(sharedPersonId);
      staffIds.push(sharedStaffId);
      lineAccountIds.push(sharedLineAccountId);

      const other = await seedOrganizationManagerShop(ctx, {
        subject: "organization_deletion_temporary_owner",
        shopName: "維持する店舗",
        plan: "free",
      });
      await ctx.db.patch(other.personId, {
        userId: sharedUserId,
        name: "維持する管理者",
        email: "shared-before@example.com",
        emailNormalized: "shared-before@example.com",
      });
      await ctx.db.patch(other.memberId, { userId: sharedUserId });

      const organization = await ctx.db.get(target.organizationId);
      if (!organization) throw new Error("organization not found");
      return {
        target,
        secondShopId,
        personIds,
        staffIds,
        lineAccountIds,
        sharedUserId,
        other,
        organizationUpdatedAt: organization.updatedAt,
      };
    });

    await t
      .withIdentity({ subject: "organization_deletion_owner" })
      .mutation(api.organization.mutations.deleteOrganization, {
        shopId: ids.target.shopId,
        organizationId: ids.target.organizationId,
        confirmOrganizationId: ids.target.organizationId,
        expectedOrganizationUpdatedAt: ids.organizationUpdatedAt,
        requestId: "organization-deletion-scenario",
      });

    const interruptedJobId = await t.run(async (ctx) => {
      const job = await ctx.db.query("deletionCleanupJobs").first();
      if (!job) throw new Error("cleanup job not found");
      await ctx.db.patch(job._id, {
        status: "processing",
        leaseId: "interrupted-worker",
        leaseExpiresAt: NOW - 1,
      });
      return job._id;
    });
    await expect(t.mutation(internal.deletionCleanup.mutations.recover, {})).resolves.toEqual({ scheduled: 1 });
    for (let iteration = 0; iteration < 300; iteration += 1) {
      vi.advanceTimersByTime(0);
      await t.finishInProgressScheduledFunctions();
      const completed = await t.run(async (ctx) => (await ctx.db.get(interruptedJobId))?.status === "completed");
      if (completed) break;
    }

    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get(interruptedJobId),
      organization: await ctx.db.get(ids.target.organizationId),
      shops: await ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.target.organizationId))
        .collect(),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.target.organizationId))
        .collect(),
      staffs: (
        await Promise.all(
          [ids.target.shopId, ids.secondShopId].map((shopId) =>
            ctx.db
              .query("staffs")
              .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
              .collect(),
          ),
        )
      ).flat(),
      lineAccounts: (
        await Promise.all(
          [ids.target.shopId, ids.secondShopId].map((shopId) =>
            ctx.db
              .query("staffLineAccounts")
              .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
              .collect(),
          ),
        )
      ).flat(),
      actorUser: await ctx.db.get(ids.target.userId),
      sharedUser: await ctx.db.get(ids.sharedUserId),
      otherOrganization: await ctx.db.get(ids.other.organizationId),
      otherPerson: await ctx.db.get(ids.other.personId),
      otherShop: await ctx.db.get(ids.other.shopId),
    }));

    expect(state.job?.status).toBe("completed");
    expect(state.organization).toMatchObject({
      isDeleted: true,
      name: "削除対象店A事業者",
      billingEmail: "organization_deletion_owner@example.com",
      billingEmailNormalized: "organization_deletion_owner@example.com",
    });
    expect(
      state.shops
        .map((shop) => ({ id: shop._id, isDeleted: shop.isDeleted, name: shop.name }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      [ids.target.shopId, ids.secondShopId]
        .map((id, index) => ({ id, isDeleted: true, name: index === 0 ? "削除対象店A" : "削除対象店B" }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(
      state.people
        .map((person) => ({
          id: person._id,
          status: person.status,
          name: person.name,
          email: person.email,
          emailNormalized: person.emailNormalized,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      [
        {
          id: ids.target.personId,
          status: "removed",
          name: "管理者",
          email: "organization_deletion_owner@example.com",
          emailNormalized: "organization_deletion_owner@example.com",
        },
        ...ids.personIds.map((id, index) => {
          const shared = index === 105;
          return {
            id,
            status: "removed",
            name: shared ? "共有スタッフ" : `一括スタッフ${index}`,
            email: shared ? "shared-before@example.com" : `bulk-${index}@example.com`,
            emailNormalized: shared ? "shared-before@example.com" : `bulk-${index}@example.com`,
          };
        }),
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(
      state.staffs
        .map((staff) => ({
          id: staff._id,
          isDeleted: staff.isDeleted,
          name: staff.name,
          email: staff.email,
          emailNormalized: staff.emailNormalized,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      ids.staffIds
        .map((id, index) => {
          const shared = index === 105;
          return {
            id,
            isDeleted: true,
            name: shared ? "共有スタッフ" : `一括スタッフ${index}`,
            email: shared ? "shared-before@example.com" : `bulk-${index}@example.com`,
            emailNormalized: shared ? "shared-before@example.com" : `bulk-${index}@example.com`,
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(
      state.lineAccounts
        .map((account) => ({
          id: account._id,
          isDeleted: account.isDeleted,
          following: account.following,
          lineUserId: account.lineUserId,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      ids.lineAccountIds
        .map((id) => ({ id, isDeleted: true, following: false, lineUserId: deletedLineUserId(id) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(state.actorUser).toMatchObject({
      isDeleted: false,
      name: "管理者",
      email: "organization_deletion_owner@example.com",
    });
    expect(state.sharedUser).toMatchObject({
      isDeleted: false,
      name: "管理者",
      email: "shared-before@example.com",
    });
    expect(state.otherOrganization).toMatchObject({ isDeleted: false });
    expect(state.otherPerson).toMatchObject({ status: "active", userId: ids.sharedUserId, name: "維持する管理者" });
    expect(state.otherShop).toMatchObject({ isDeleted: false, name: "維持する店舗" });

    const remainingShops = await t
      .withIdentity({ subject: "organization_deletion_shared" })
      .query(api.dashboard.queries.getMyShops, {});
    expect(remainingShops.map((shop) => shop.shopId)).toEqual([ids.other.shopId]);

    const actor = t.withIdentity({ subject: "organization_deletion_owner" });
    await expect(actor.query(api.dashboard.queries.getMyShops, {})).resolves.toEqual([]);
    await expect(actor.query(api.dashboard.queries.getCurrentUser, {})).resolves.toMatchObject({
      isNewUser: false,
      name: "管理者",
      email: "organization_deletion_owner@example.com",
    });

    const newShopId = await actor.mutation(api.setup.mutations.setupShopAndManager, {
      shopName: "再登録店舗",
      submissionPattern: { kind: "dateOnly" },
      managerName: "再登録管理者",
      managerEmail: "organization-deletion-owner-new@example.com",
      acceptedLegal: true,
    });
    await expect(t.run((ctx) => ctx.db.get(newShopId))).resolves.toMatchObject({
      name: "再登録店舗",
      isDeleted: false,
    });
  }, 15_000);
});
