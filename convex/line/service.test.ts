import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedOrganizationPersonLineLink, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX } from "../constants";
import {
  getOrganizationPersonLineState,
  listActiveStaffsForOrganizationPerson,
  resolveOrganizationPersonLineInheritanceRecipient,
  resolveOrganizationPersonLineRecipient,
  resolveStaffLineRecipient,
} from "./service";

async function setupPerson(t: TestConvex<typeof schema>, suffix: string) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, {
      subject: `manager_${suffix}`,
      email: `manager_${suffix}@example.com`,
      shopName: `店舗${suffix}`,
      plan: "standard",
    });
    const now = Date.now();
    const organizationPersonId = await ctx.db.insert("organizationPeople", {
      organizationId: seeded.organizationId,
      name: `スタッフ${suffix}`,
      email: `staff_${suffix}@example.com`,
      emailNormalized: `staff_${suffix}@example.com`,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId: seeded.shopId,
      organizationId: seeded.organizationId,
      organizationPersonId,
      name: `スタッフ${suffix}`,
      email: `staff_${suffix}@example.com`,
      isDeleted: false,
    });
    return { ...seeded, organizationPersonId, staffId };
  });
}

async function readAllResolvers(
  t: TestConvex<typeof schema>,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
  },
) {
  return await t.run(async (ctx) => ({
    staff: await resolveStaffLineRecipient(ctx, { staffId: args.staffId, shopId: args.shopId }),
    person: await resolveOrganizationPersonLineRecipient(ctx, args),
    state: await getOrganizationPersonLineState(ctx, args),
  }));
}

describe("line/service canonical read authority", () => {
  it("常にcanonical linkを正本にし、legacy rowを読まない", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "canonical_authority");
    const canonical = await t.run(async (ctx) => {
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_legacy_ignored",
        following: false,
      });
      return await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_canonical_authority",
        following: true,
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result.staff).toMatchObject({
      authority: "canonical",
      organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
      lineProviderUserId: canonical.lineProviderUserId,
      lineUserId: "U_canonical_authority",
      following: true,
      generation: canonical.generation,
    });
    expect(result.person).toMatchObject({ authority: "canonical", lineUserId: "U_canonical_authority" });
    expect(result.state).toEqual({
      authority: "canonical",
      status: "linked_following",
      organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
      generation: canonical.generation,
    });
  });

  it("legacy rowしかない人物はlegacy rowへfallbackせず通常の未連携として返す", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "canonical_no_fallback");
    await t.run(async (ctx) => {
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_legacy_only",
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result.staff).toBeNull();
    expect(result.person).toBeNull();
    expect(result.state).toEqual({
      authority: "canonical",
      status: "unlinked",
      organizationPersonLineLinkId: null,
      generation: 0,
    });
  });

  it.each(["duplicate_link", "duplicate_provider", "deleted_provider"] as const)(
    "canonicalの一意性・lifecycle不整合(%s)ではPIIを返さずfail closed",
    async (corruption) => {
      const t = convexTest(schema, modules);
      const target = await setupPerson(t, corruption);
      await t.run(async (ctx) => {
        const canonical = await seedOrganizationPersonLineLink(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          lineUserId: `U_${corruption}`,
        });
        if (corruption === "duplicate_link") {
          await seedOrganizationPersonLineLink(ctx, {
            organizationId: target.organizationId,
            organizationPersonId: target.organizationPersonId,
            lineUserId: "U_duplicate_link_second",
            generation: canonical.generation,
          });
        } else if (corruption === "duplicate_provider") {
          await ctx.db.insert("lineProviderUsers", {
            lineUserId: `U_${corruption}`,
            following: true,
            stateVersion: 1,
            friendshipObservedAt: Date.now(),
            friendshipObservationSource: "oauth",
            isDeleted: false,
          });
        } else {
          await ctx.db.patch(canonical.lineProviderUserId, { isDeleted: true });
        }
      });

      await expect(readAllResolvers(t, target)).resolves.toEqual({ staff: null, person: null, state: null });
    },
  );

  it("canonical linkのtenant参照が不整合ならPIIを返さずfail closed", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "tenant_mismatch");
    const otherTenant = await setupPerson(t, "tenant_mismatch_other");
    await t.run(async (ctx) => {
      const canonical = await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_tenant_mismatch",
      });
      await ctx.db.patch(canonical.organizationPersonLineLinkId, { organizationId: otherTenant.organizationId });
    });

    await expect(readAllResolvers(t, target)).resolves.toEqual({ staff: null, person: null, state: null });
  });

  it("staffとpersonのuserIdが一致しない所属はcanonical宛先として解決しない", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "user_mismatch");
    await t.run(async (ctx) => {
      await ctx.db.patch(target.staffId, { userId: target.userId });
      await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_user_mismatch",
      });
    });

    await expect(
      t.run(async (ctx) =>
        resolveStaffLineRecipient(ctx, {
          staffId: target.staffId,
          shopId: target.shopId,
        }),
      ),
    ).resolves.toBeNull();
  });

  it.each([
    ["参照切れ", "dangling"],
    ["削除済み", "deleted"],
    ["削除受付済み", "requested"],
  ] as const)("linked userが%sならstaff/personのcanonical LINE解決をfail closedにする", async (_label, state) => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, `linked_user_${state}`);
    await t.run(async (ctx) => {
      const now = Date.now();
      const linkedUserId = await ctx.db.insert("users", {
        authTokenIdentifier: `https://convex.test|line_linked_user_${state}`,
        name: "LINE連携対象",
        email: `line-linked-user-${state}@example.com`,
        emailNormalized: `line-linked-user-${state}@example.com`,
        role: "manager",
        isDeleted: false,
      });
      await Promise.all([
        ctx.db.patch(target.organizationPersonId, { userId: linkedUserId, updatedAt: now }),
        ctx.db.patch(target.staffId, { userId: linkedUserId }),
      ]);
      await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: `U_linked_user_${state}`,
      });
      if (state === "dangling") await ctx.db.delete(linkedUserId);
      else if (state === "deleted") await ctx.db.patch(linkedUserId, { isDeleted: true });
      else await ctx.db.patch(linkedUserId, { accountDeletionRequestedAt: now });
    });

    await expect(readAllResolvers(t, target)).resolves.toEqual({ staff: null, person: null, state: null });
  });

  it("削除済み所属履歴が上限を超えても非削除staffだけをboundedに返す", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "deleted_history");
    await t.run(async (ctx) => {
      for (let index = 0; index <= LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX; index += 1) {
        await ctx.db.insert("staffs", {
          shopId: target.shopId,
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          name: `削除済み${index}`,
          email: `deleted-${index}@example.com`,
          isDeleted: true,
        });
      }
    });

    const nonDeletedStaffs = await t.run(async (ctx) =>
      listActiveStaffsForOrganizationPerson(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
      }),
    );
    expect(nonDeletedStaffs.map((staff) => staff._id)).toEqual([target.staffId]);
  });

  it("論理削除済み店舗の所属は上限へ数えない", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "deleted_shop_history");
    await t.run(async (ctx) => {
      for (let index = 0; index <= LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX; index += 1) {
        const shopId = await ctx.db.insert("shops", {
          organizationId: target.organizationId,
          name: `削除済み店舗${index}`,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
          regularClosedDays: [],
          isDeleted: true,
        });
        await ctx.db.insert("staffs", {
          shopId,
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          name: `削除済み店舗所属${index}`,
          email: `deleted-shop-${index}@example.com`,
          isDeleted: false,
        });
      }
    });

    const nonDeletedStaffs = await t.run(async (ctx) =>
      listActiveStaffsForOrganizationPerson(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
      }),
    );
    expect(nonDeletedStaffs.map((staff) => staff._id)).toEqual([target.staffId]);
  });

  it("非削除所属が上限を超えるとbounded集約をfail closedにする", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "nondeleted_overflow");
    await t.run(async (ctx) => {
      for (let index = 1; index <= LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX; index += 1) {
        const shopId = await ctx.db.insert("shops", {
          organizationId: target.organizationId,
          name: `非削除店舗${index}`,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          name: `非削除所属${index}`,
          email: `nondeleted-overflow-${index}@example.com`,
          isDeleted: false,
        });
      }
    });

    await expect(
      t.run(async (ctx) =>
        listActiveStaffsForOrganizationPerson(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
        }),
      ),
    ).rejects.toThrow("LINE連携を完了できませんでした。");
  });

  it.each([true, false])(
    "最後の非削除所属がなくてもretained canonical linkはfollowing=%sを表示しwrite継承できる",
    async (following) => {
      const t = convexTest(schema, modules);
      const target = await setupPerson(t, `last_membership_${following}`);
      const canonical = await t.run(async (ctx) => {
        const seeded = await seedOrganizationPersonLineLink(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          lineUserId: `U_last_membership_${following}`,
          following,
        });
        await ctx.db.patch(target.shopId, { isDeleted: true });
        return seeded;
      });

      const result = await readAllResolvers(t, target);
      expect(result.staff).toBeNull();
      expect(result.person).toMatchObject({
        authority: "canonical",
        organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
        generation: canonical.generation,
        lineUserId: `U_last_membership_${following}`,
        following,
      });
      expect(result.state).toEqual({
        authority: "canonical",
        status: following ? "linked_following" : "linked_unfollowed",
        organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
        generation: canonical.generation,
      });
      const inheritance = await t.run(async (ctx) =>
        resolveOrganizationPersonLineInheritanceRecipient(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
        }),
      );
      expect(inheritance).toMatchObject({
        authority: "canonical",
        organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
        generation: canonical.generation,
        lineUserId: `U_last_membership_${following}`,
        following,
      });
    },
  );

  it("last membership removal後のretained canonicalのgeneration不整合はstateもwrite継承もfail closed", async () => {
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "last_membership_corrupt");
    await t.run(async (ctx) => {
      const canonical = await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_last_membership_corrupt",
      });
      await ctx.db.patch(target.organizationPersonId, { lineLinkGeneration: canonical.generation + 1 });
      await ctx.db.patch(target.shopId, { isDeleted: true });
    });

    const state = await t.run(async (ctx) =>
      getOrganizationPersonLineState(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
      }),
    );
    expect(state).toBeNull();
    await expect(
      t.run(async (ctx) =>
        resolveOrganizationPersonLineInheritanceRecipient(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
        }),
      ),
    ).resolves.toBeNull();
  });
});
