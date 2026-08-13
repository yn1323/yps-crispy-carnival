import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedOrganizationPersonLineLink, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX } from "../constants";
import {
  getOrganizationPersonLineState,
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
      plan: "pro",
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

describe("line/service read authority", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("legacy authorityでもcanonical counterpartが不一致ならPIIを返さずfail closed", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "legacy_authority");
    const canonical = await t.run(async (ctx) => {
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_legacy_authority",
        following: false,
      });
      return await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_canonical_ignored",
        following: true,
      });
    });

    const result = await readAllResolvers(t, target);
    expect(canonical.generation).toBe(1);
    expect(result).toEqual({ staff: null, person: null, state: null });
  });

  it("legacy authorityは完全一致canonical counterpartだけをoptional snapshotとして返す", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "legacy_snapshot");
    const canonical = await t.run(async (ctx) => {
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_legacy_snapshot",
        following: true,
      });
      return await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_legacy_snapshot",
        following: true,
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result.staff).toMatchObject({
      authority: "legacy",
      lineUserId: "U_legacy_snapshot",
      following: true,
      organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
      generation: canonical.generation,
    });
    expect(result.person).toMatchObject({
      authority: "legacy",
      organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
      generation: canonical.generation,
    });
    expect(result.state).toMatchObject({ authority: "legacy", status: "linked_following" });
  });

  it("pure legacy recipientはcanonical snapshotなしでID一致互換を維持する", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "pure_legacy");
    await t.run(async (ctx) => {
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_pure_legacy",
        following: true,
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result.staff).toMatchObject({ authority: "legacy", lineUserId: "U_pure_legacy" });
    expect(result.staff).not.toHaveProperty("organizationPersonLineLinkId");
    expect(result.staff).not.toHaveProperty("generation");
    expect(result.person).not.toHaveProperty("organizationPersonLineLinkId");
    expect(result.person).not.toHaveProperty("generation");
  });

  it("exact enabledだけcanonical linkを正本にし、legacy rowを読まない", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "enabled");
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

  it("legacy personに複数LINE IDまたはfriendship不一致があればPIIを返さずfail closed", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "invalid");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "legacy_conflict");
    await t.run(async (ctx) => {
      const secondStaffId = await ctx.db.insert("staffs", {
        shopId: target.shopId,
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        name: "競合スタッフ",
        email: "legacy-conflict-second@example.com",
        isDeleted: false,
      });
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_first",
        following: true,
      });
      await seedStaffLineAccount(ctx, {
        staffId: secondStaffId,
        shopId: target.shopId,
        lineUserId: "U_second",
        following: true,
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result.staff).toBeNull();
    expect(result.person).toBeNull();
    expect(result.state).toBeNull();
  });

  it("canonical authorityはlegacy rowしかない人物を通常の未連携として返す", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "enabled");
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

  it("旧shopのoperatingStatus未定義をactiveとしてcanonical resolverで解決する", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "enabled");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "legacy_shop_status");
    const canonical = await t.run(async (ctx) => {
      await ctx.db.patch(target.shopId, { operatingStatus: undefined });
      return await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_legacy_shop_status",
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result.staff).toMatchObject({
      authority: "canonical",
      organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
      lineUserId: "U_legacy_shop_status",
    });
    expect(result.person).toMatchObject({ authority: "canonical", lineUserId: "U_legacy_shop_status" });
  });

  it("削除済み所属履歴が上限を超えてもactive staffだけをbounded集約する", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
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
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_active_after_history",
      });
    });

    const state = await t.run(async (ctx) =>
      getOrganizationPersonLineState(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
      }),
    );
    expect(state).toMatchObject({ authority: "legacy", status: "linked_following" });
  });

  it("archived店舗の所属履歴21件はactive上限へ数えずrecipientを解決する", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "archived_history");
    await t.run(async (ctx) => {
      for (let index = 0; index <= LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX; index += 1) {
        const shopId = await ctx.db.insert("shops", {
          organizationId: target.organizationId,
          operatingStatus: "archived",
          name: `停止店舗${index}`,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          name: `停止所属${index}`,
          email: `archived-${index}@example.com`,
          isDeleted: false,
        });
      }
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_after_archived_history",
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result.staff).toMatchObject({ authority: "legacy", lineUserId: "U_after_archived_history" });
    expect(result.person).toMatchObject({ authority: "legacy", lineUserId: "U_after_archived_history" });
  });

  it("active所属が21件ならbounded上限でrecipientをfail closedにする", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "active_overflow");
    await t.run(async (ctx) => {
      for (let index = 1; index <= LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX; index += 1) {
        const shopId = await ctx.db.insert("shops", {
          organizationId: target.organizationId,
          operatingStatus: "active",
          name: `active店舗${index}`,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          name: `active所属${index}`,
          email: `active-overflow-${index}@example.com`,
          isDeleted: false,
        });
      }
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: target.shopId,
        lineUserId: "U_active_overflow",
      });
    });

    await expect(readAllResolvers(t, target)).rejects.toThrow("LINE連携を完了できませんでした。");
  });

  it.each([true, false])(
    "legacy authorityの最後のactive所属がなくてもretained canonical stateはfollowing=%sを表示しwrite継承できる",
    async (following) => {
      vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
      const t = convexTest(schema, modules);
      const target = await setupPerson(t, `last_membership_${following}`);
      const canonical = await t.run(async (ctx) => {
        const seeded = await seedOrganizationPersonLineLink(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
          lineUserId: `U_last_membership_${following}`,
          following,
        });
        await ctx.db.patch(target.shopId, { operatingStatus: "archived" });
        return seeded;
      });

      const result = await readAllResolvers(t, target);
      expect(result.staff).toBeNull();
      expect(result.person).toBeNull();
      expect(result.state).toEqual({
        authority: "legacy",
        status: following ? "linked_following" : "linked_unfollowed",
        organizationPersonLineLinkId: null,
        generation: canonical.generation,
      });
      const inheritance = await t.run(async (ctx) =>
        resolveOrganizationPersonLineInheritanceRecipient(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
        }),
      );
      expect(inheritance).toMatchObject({
        authority: "legacy",
        organizationPersonLineLinkId: canonical.organizationPersonLineLinkId,
        generation: canonical.generation,
        lineUserId: `U_last_membership_${following}`,
        following,
      });
    },
  );

  it("last membership removal後のretained canonical不整合はstateもwrite継承もfail closed", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "last_membership_corrupt");
    await t.run(async (ctx) => {
      const canonical = await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_last_membership_corrupt",
      });
      await ctx.db.patch(target.organizationPersonId, { lineLinkGeneration: canonical.generation + 1 });
      await ctx.db.patch(target.shopId, { operatingStatus: "archived" });
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
    ).rejects.toThrow("LINE連携を完了できませんでした。");
  });

  it("active所属があるのにlegacy projection欠損でcanonical linkだけなら招待用stateをfail closed", async () => {
    vi.stubEnv("LINE_COMMON_LINK_CANONICAL_READS", "");
    const t = convexTest(schema, modules);
    const target = await setupPerson(t, "active_projection_missing");
    await t.run(async (ctx) => {
      await seedOrganizationPersonLineLink(ctx, {
        organizationId: target.organizationId,
        organizationPersonId: target.organizationPersonId,
        lineUserId: "U_active_projection_missing",
      });
    });

    const result = await readAllResolvers(t, target);
    expect(result).toEqual({ staff: null, person: null, state: null });
    await expect(
      t.run(async (ctx) =>
        resolveOrganizationPersonLineInheritanceRecipient(ctx, {
          organizationId: target.organizationId,
          organizationPersonId: target.organizationPersonId,
        }),
      ),
    ).rejects.toThrow("LINE連携を完了できませんでした。");
  });
});
