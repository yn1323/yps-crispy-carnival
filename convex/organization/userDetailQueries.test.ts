import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getTestOrganizationId, seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const NOW = Date.UTC(2026, 6, 19, 3);

async function seedPerson(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    name?: string;
    email?: string;
    status?: "active" | "removed";
    userId?: Id<"users">;
  },
) {
  const email = args.email ?? "detail-person@example.com";
  return await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    ...(args.userId ? { userId: args.userId } : {}),
    name: args.name ?? "詳細対象ユーザー",
    email,
    emailNormalized: email,
    status: args.status ?? "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedStaff(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    shopId: Id<"shops">;
    name?: string;
    email?: string;
    excludedFromShift?: boolean;
    isDeleted?: boolean;
    userId?: Id<"users">;
  },
) {
  const email = args.email ?? "detail-person@example.com";
  return await ctx.db.insert("staffs", {
    organizationId: args.organizationId,
    organizationPersonId: args.personId,
    shopId: args.shopId,
    name: args.name ?? "詳細対象ユーザー",
    email,
    emailNormalized: email,
    ...(args.userId ? { userId: args.userId } : {}),
    excludedFromShift: args.excludedFromShift ?? false,
    isDeleted: args.isDeleted ?? false,
  });
}

describe("organization/userDetailQueries.getUserDetail", () => {
  it.each([
    ["参照切れ", "dangling"],
    ["削除済み", "deleted"],
    ["削除受付済み", "requested"],
  ] as const)("linked userが%sの人物詳細はPIIを返さずnullにする", async (_label, state) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: `user_detail_linked_user_${state}`,
        plan: "standard",
      });
      const linkedUserId = await seedUser(
        ctx,
        `user_detail_target_${state}`,
        `user-detail-target-${state}@example.com`,
      );
      const personId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: `user-detail-target-${state}@example.com`,
        userId: linkedUserId,
      });
      await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: base.shopId,
        email: `user-detail-target-${state}@example.com`,
        userId: linkedUserId,
      });
      if (state === "dangling") await ctx.db.delete(linkedUserId);
      else if (state === "deleted") await ctx.db.patch(linkedUserId, { isDeleted: true });
      else await ctx.db.patch(linkedUserId, { accountDeletionRequestedAt: NOW });
      return { ...base, personId };
    });

    await expect(
      t
        .withIdentity({ subject: `user_detail_linked_user_${state}` })
        .query(api.organization.userDetailQueries.getUserDetail, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          personId: ids.personId,
          now: NOW,
        }),
    ).resolves.toBeNull();
  });

  it("active.freeの利用人数超過中は人物削除だけを許可し、通常編集と店舗所属変更を閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_usage_over_limit",
        plan: "free",
      });
      const personIds = [];
      for (let index = 0; index < 5; index += 1) {
        const personId = await seedPerson(ctx, {
          organizationId: base.organizationId,
          name: `上限超過スタッフ${index}`,
          email: `user-detail-over-limit-${index}@example.com`,
        });
        await seedStaff(ctx, {
          organizationId: base.organizationId,
          personId,
          shopId: base.shopId,
          name: `上限超過スタッフ${index}`,
          email: `user-detail-over-limit-${index}@example.com`,
        });
        personIds.push(personId);
      }
      return { ...base, targetPersonId: personIds[0] };
    });

    const result = await t
      .withIdentity({ subject: "user_detail_usage_over_limit" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        now: NOW,
      });

    expect(result).toMatchObject({
      canWrite: false,
      writeDisabledReason: expect.stringContaining("プラン上限を超過"),
      canRemove: true,
      canRemoveManagerRole: false,
      shops: [{ shopId: ids.shopId, canChangeMembership: false }],
      memberships: [{ shopId: ids.shopId, canRemove: false }],
    });
  });

  it("組織人物と未削除店舗所属を最小DTOで返し、管理者招待の有無を更新する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_actor",
        shopName: "青山店",
        plan: "standard",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        name: "赤坂店",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
      const thirdShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        name: "上野店",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
      await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        name: "削除済み店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: true,
      });
      await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_other_organization_shop",
        shopName: "別グループ店舗",
        plan: "standard",
      });
      const personId = await seedPerson(ctx, { organizationId: base.organizationId });
      const firstStaffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: base.shopId,
        excludedFromShift: true,
      });
      const secondStaffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: secondShopId,
      });
      const thirdStaffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: thirdShopId,
      });
      await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: secondShopId,
        isDeleted: true,
      });
      const lineProviderUserId = await ctx.db.insert("lineProviderUsers", {
        lineUserId: "never-return-line-user-id",
        following: true,
        stateVersion: 1,
        friendshipObservedAt: NOW,
        friendshipObservationSource: "oauth",
        isDeleted: false,
      });
      await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: base.organizationId,
        organizationPersonId: personId,
        lineProviderUserId,
        generation: 0,
        linkedAt: NOW,
        isDeleted: false,
      });
      return { ...base, personId, firstStaffId, secondStaffId, secondShopId, thirdShopId, thirdStaffId };
    });
    const actor = t.withIdentity({ subject: "user_detail_actor" });

    const result = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    });

    expect(result).toEqual({
      person: {
        id: ids.personId,
        name: "詳細対象ユーザー",
        email: "detail-person@example.com",
        hasLinkedAccount: false,
      },
      isSelf: false,
      managerRole: "none",
      hasManagerInvitation: false,
      canRemoveManagerRole: false,
      canRemove: true,
      removalPreview: {
        kind: "ready",
        asOfDate: "2026-07-19",
        assignmentCount: 0,
        fingerprint: expect.any(String),
      },
      canWrite: true,
      line: {
        status: "linked_following",
        actionShopId: ids.shopId,
        sourceStaffId: ids.thirdStaffId,
        sourceShopId: ids.thirdShopId,
        canLink: true,
        canDisconnect: true,
      },
      membershipFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      shops: [
        {
          shopId: ids.thirdShopId,
          shopName: "上野店",
          canChangeMembership: true,
        },
        {
          shopId: ids.shopId,
          shopName: "青山店",
          canChangeMembership: true,
        },
        {
          shopId: ids.secondShopId,
          shopName: "赤坂店",
          canChangeMembership: true,
        },
      ],
      memberships: [
        {
          staffId: ids.thirdStaffId,
          shopId: ids.thirdShopId,
          shopName: "上野店",
          excludedFromShift: false,
          canRemove: true,
          removalPreview: {
            kind: "ready",
            asOfDate: "2026-07-19",
            assignmentCount: 0,
            fingerprint: expect.any(String),
          },
        },
        {
          staffId: ids.firstStaffId,
          shopId: ids.shopId,
          shopName: "青山店",
          excludedFromShift: true,
          canRemove: true,
          removalPreview: {
            kind: "ready",
            asOfDate: "2026-07-19",
            assignmentCount: 0,
            fingerprint: expect.any(String),
          },
        },
        {
          staffId: ids.secondStaffId,
          shopId: ids.secondShopId,
          shopName: "赤坂店",
          excludedFromShift: false,
          canRemove: true,
          removalPreview: {
            kind: "ready",
            asOfDate: "2026-07-19",
            assignmentCount: 0,
            fingerprint: expect.any(String),
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("never-return-line-user-id");

    const fromThirdShop = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.thirdShopId),
      shopId: ids.thirdShopId,
      personId: ids.personId,
      now: NOW,
    });
    expect(fromThirdShop?.canWrite).toBe(true);

    await t.run(async (ctx) => {
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        invitedName: "詳細対象",
        email: "detail-person@example.com",
        emailNormalized: "detail-person@example.com",
        tokenDigest: "never-return-invitation-token",
        status: "issued",
        inviterMemberId: ids.memberId,
        targetPersonId: ids.personId,
        reservedSeat: false,
        version: 1,
        expiresAt: NOW + 86_400_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const pending = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    });
    expect(pending).toMatchObject({
      hasManagerInvitation: true,
    });
    expect(JSON.stringify(pending)).not.toContain("never-return-invitation-token");
  });

  it("組織人物のcanonical LINE状態を全店舗で共通の最小DTOへ射影する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_common_line",
        shopName: "青山店",
        plan: "standard",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        name: "赤坂店",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
      const personId = await seedPerson(ctx, { organizationId: base.organizationId });
      const firstStaffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: base.shopId,
      });
      await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: secondShopId,
      });
      const providerId = await ctx.db.insert("lineProviderUsers", {
        lineUserId: "never-return-canonical-line-user-id",
        following: true,
        stateVersion: 1,
        friendshipObservedAt: NOW,
        friendshipObservationSource: "oauth",
        isDeleted: false,
      });
      await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: base.organizationId,
        organizationPersonId: personId,
        lineProviderUserId: providerId,
        generation: 0,
        linkedAt: NOW,
        isDeleted: false,
      });
      return { ...base, personId, firstStaffId, providerId };
    });
    const actor = t.withIdentity({ subject: "user_detail_common_line" });

    const linked = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    });

    expect(linked?.line).toEqual({
      status: "linked_following",
      actionShopId: ids.shopId,
      sourceStaffId: ids.firstStaffId,
      sourceShopId: ids.shopId,
      canLink: true,
      canDisconnect: true,
    });
    expect(linked?.memberships).toHaveLength(2);
    expect(linked?.memberships.every((membership) => !("line" in membership))).toBe(true);
    expect(JSON.stringify(linked)).not.toContain("never-return-canonical-line-user-id");

    await t.run(async (ctx) => await ctx.db.patch(ids.providerId, { following: false, stateVersion: 2 }));
    const unfollowed = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    });
    expect(unfollowed?.line.status).toBe("linked_unfollowed");
  });

  it("canonical LINE linkの重複またはgeneration不整合を人物詳細ごとfail closedにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_line_inconsistent",
        plan: "standard",
      });
      const personId = await seedPerson(ctx, { organizationId: base.organizationId });
      await seedStaff(ctx, { organizationId: base.organizationId, personId, shopId: base.shopId });
      const providerId = await ctx.db.insert("lineProviderUsers", {
        lineUserId: "line-inconsistent",
        following: true,
        stateVersion: 1,
        friendshipObservedAt: NOW,
        friendshipObservationSource: "oauth",
        isDeleted: false,
      });
      const linkId = await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: base.organizationId,
        organizationPersonId: personId,
        lineProviderUserId: providerId,
        generation: 1,
        linkedAt: NOW,
        isDeleted: false,
      });
      return { ...base, personId, providerId, linkId };
    });
    const actor = t.withIdentity({ subject: "user_detail_line_inconsistent" });
    const args = {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    };

    await expect(actor.query(api.organization.userDetailQueries.getUserDetail, args)).resolves.toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.linkId, { generation: 0 });
      await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: ids.organizationId,
        organizationPersonId: ids.personId,
        lineProviderUserId: ids.providerId,
        generation: 0,
        linkedAt: NOW + 1,
        isDeleted: false,
      });
    });
    await expect(actor.query(api.organization.userDetailQueries.getUserDetail, args)).resolves.toBeNull();
  });

  it("canonical read authorityではlegacy LINE行へfallbackしない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_canonical_no_fallback",
        plan: "standard",
      });
      const personId = await seedPerson(ctx, { organizationId: base.organizationId });
      const staffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: base.shopId,
      });
      await ctx.db.insert("staffLineAccounts", {
        staffId,
        shopId: base.shopId,
        lineUserId: "legacy-only-line-user-id",
        linkedAt: NOW,
        following: true,
        isDeleted: false,
      });
      return { ...base, personId };
    });

    const result = await t
      .withIdentity({ subject: "user_detail_canonical_no_fallback" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.personId,
        now: NOW,
      });

    expect(result?.line.status).toBe("unlinked");
    expect(JSON.stringify(result)).not.toContain("legacy-only-line-user-id");
  });

  it("壊れたID、他組織人物、removed人物を同じnullへ寄せる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, { subject: "user_detail_boundary", plan: "standard" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "user_detail_other", plan: "standard" });
      const removedPersonId = await seedPerson(ctx, {
        organizationId: actor.organizationId,
        email: "removed-detail@example.com",
        status: "removed",
      });
      return { actor, other, removedPersonId };
    });
    const actor = t.withIdentity({ subject: "user_detail_boundary" });

    const invalid = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.actor.shopId),
      shopId: ids.actor.shopId,
      personId: "not-a-convex-id",
      now: NOW,
    });
    const crossOrganization = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.actor.shopId),
      shopId: ids.actor.shopId,
      personId: ids.other.personId,
      now: NOW,
    });
    const removed = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.actor.shopId),
      shopId: ids.actor.shopId,
      personId: ids.removedPersonId,
      now: NOW,
    });
    const unauthenticated = await t.query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.actor.shopId),
      shopId: ids.actor.shopId,
      personId: ids.actor.personId,
      now: NOW,
    });

    expect([invalid, crossOrganization, removed, unauthenticated]).toEqual([null, null, null, null]);
  });

  it("personと管理者memberの本人性を確認できない場合はnullにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_member_identity",
        plan: "standard",
      });
      const memberUserId = await seedUser(ctx, "user_detail_member_identity_target");
      const otherUserId = await seedUser(ctx, "user_detail_member_identity_other");
      const personId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: "member-identity@example.com",
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId,
        userId: memberUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...base, personId, memberUserId, otherUserId };
    });
    const actor = t.withIdentity({ subject: "user_detail_member_identity" });
    const args = {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    };

    await expect(actor.query(api.organization.userDetailQueries.getUserDetail, args)).resolves.toBeNull();

    await t.run(async (ctx) => await ctx.db.patch(ids.personId, { userId: ids.otherUserId }));
    await expect(actor.query(api.organization.userDetailQueries.getUserDetail, args)).resolves.toBeNull();

    await t.run(async (ctx) => await ctx.db.patch(ids.personId, { userId: ids.memberUserId }));
    await expect(actor.query(api.organization.userDetailQueries.getUserDetail, args)).resolves.toMatchObject({
      managerRole: "active",
    });

    await t.run(async (ctx) => await ctx.db.patch(ids.memberUserId, { isDeleted: true }));
    await expect(actor.query(api.organization.userDetailQueries.getUserDetail, args)).resolves.toBeNull();
  });

  it("店舗未所属の組織管理者もユーザー詳細として返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_manager_without_shop",
        plan: "standard",
      });
      const targetUserId = await seedUser(
        ctx,
        "user_detail_manager_without_shop_target",
        "manager-without-shop@example.com",
      );
      const personId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: "manager-without-shop@example.com",
        userId: targetUserId,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId,
        userId: targetUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const providerId = await ctx.db.insert("lineProviderUsers", {
        lineUserId: "manager-without-shop-line-id",
        following: true,
        stateVersion: 1,
        friendshipObservedAt: NOW,
        friendshipObservationSource: "oauth",
        isDeleted: false,
      });
      await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: base.organizationId,
        organizationPersonId: personId,
        lineProviderUserId: providerId,
        generation: 0,
        linkedAt: NOW,
        isDeleted: false,
      });
      return { ...base, targetPersonId: personId };
    });

    const result = await t
      .withIdentity({ subject: "user_detail_manager_without_shop" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        now: NOW,
      });

    expect(result).toMatchObject({
      isSelf: false,
      managerRole: "active",
      canRemoveManagerRole: true,
      canRemove: false,
      removeDisabledReason: "先に管理者権限を外してください。",
      shops: [
        {
          shopId: ids.shopId,
          canChangeMembership: true,
        },
      ],
      memberships: [],
      line: {
        status: "linked_following",
        actionShopId: ids.shopId,
        sourceStaffId: null,
        sourceShopId: null,
        canLink: false,
        linkDisabledReason: "LINE連携を設定するには、店舗へ所属を追加してください。",
        canDisconnect: true,
      },
    });

    await expect(
      t
        .withIdentity({ subject: "user_detail_manager_without_shop" })
        .query(api.organization.userDetailQueries.getUserDetail, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          personId: ids.targetPersonId,
          now: NOW,
          requireTargetShopMembership: true,
        }),
    ).resolves.toBeNull();

    const self = await t
      .withIdentity({ subject: "user_detail_manager_without_shop" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.personId,
        now: NOW,
      });
    expect(self?.isSelf).toBe(true);
    expect(self?.person.hasLinkedAccount).toBe(true);
  });

  it("active管理者の店舗所属は解除可能と返し、人物削除と管理者role解除の契約を分離する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_manager_membership",
        plan: "standard",
      });
      const targetUserId = await seedUser(
        ctx,
        "user_detail_manager_membership_target",
        "manager-membership@example.com",
      );
      const targetPersonId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: "manager-membership@example.com",
        userId: targetUserId,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: targetPersonId,
        userId: targetUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const targetStaffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId: targetPersonId,
        shopId: base.shopId,
        email: "manager-membership@example.com",
      });
      return { ...base, targetPersonId, targetStaffId };
    });

    const result = await t
      .withIdentity({ subject: "user_detail_manager_membership" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        now: NOW,
      });

    expect(result).toMatchObject({
      managerRole: "active",
      canRemoveManagerRole: true,
      canRemove: false,
      removeDisabledReason: "先に管理者権限を外してください。",
      shops: [{ shopId: ids.shopId, canChangeMembership: true }],
      memberships: [{ staffId: ids.targetStaffId, canRemove: true }],
    });
    expect(result?.shops[0]).not.toHaveProperty("membershipChangeDisabledReason");
    expect(result?.memberships[0]).not.toHaveProperty("removeDisabledReason");
  });

  it("本人性を確認できないactive memberを有効な後任管理者として数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_last_valid_manager",
        plan: "standard",
      });
      await ctx.db.patch(base.organizationId, {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
      });
      const invalidUserId = await seedUser(ctx, "user_detail_invalid_manager");
      const invalidPersonId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: "invalid-manager@example.com",
        status: "removed",
        userId: invalidUserId,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: invalidPersonId,
        userId: invalidUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "user_detail_last_valid_manager" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.personId,
        now: NOW,
      });

    expect(result).toMatchObject({
      isSelf: true,
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "少なくとも管理者が1名必要です。",
      canRemove: false,
      removeDisabledReason: "先に管理者権限を外してください。",
    });
  });

  it("管理者所属または店舗所属が重複した不整合はnullにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_duplicates",
        plan: "standard",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_duplicates_other",
        plan: "standard",
      });
      const targetUserId = await seedUser(ctx, "user_detail_target_manager", "target-manager@example.com");
      const personId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: "target-manager@example.com",
        userId: targetUserId,
      });
      const memberId = await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId,
        userId: targetUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const removedMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId,
        userId: targetUserId,
        status: "removed",
        createdAt: NOW - 1,
        updatedAt: NOW - 1,
      });
      const staffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: base.shopId,
        email: "target-manager@example.com",
      });
      return { ...base, targetUserId, personId, memberId, removedMemberId, staffId, otherShopId: other.shopId };
    });
    const actor = t.withIdentity({ subject: "user_detail_duplicates" });
    const args = {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    };

    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toBeNull();
    await t.run(async (ctx) => await ctx.db.delete(ids.removedMemberId));

    const invalidShopStaffId = await t.run(
      async (ctx) =>
        await seedStaff(ctx, {
          organizationId: ids.organizationId,
          personId: ids.personId,
          shopId: ids.otherShopId,
          email: "target-manager@example.com",
        }),
    );
    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toBeNull();
    await t.run(async (ctx) => await ctx.db.patch(invalidShopStaffId, { isDeleted: true }));

    const duplicateMemberId = await t.run(
      async (ctx) =>
        await ctx.db.insert("organizationMembers", {
          organizationId: ids.organizationId,
          personId: ids.personId,
          userId: ids.targetUserId,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
        }),
    );
    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(duplicateMemberId, { status: "removed" });
      await seedStaff(ctx, {
        organizationId: ids.organizationId,
        personId: ids.personId,
        shopId: ids.shopId,
        email: "target-manager@example.com",
      });
    });
    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toBeNull();
  });

  it("今日以降の対象店舗割当だけを削除previewへ数え、Capabilityは無効化しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_assignment",
        plan: "standard",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        name: "別店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
      const personId = await seedPerson(ctx, { organizationId: base.organizationId });
      const staffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: base.shopId,
      });
      const positionId = await ctx.db.insert("positions", {
        isDefault: false,
        shopId: base.shopId,
        name: "ホール",
        color: "#000000",
        sortOrder: 0,
        isDeleted: false,
      });
      const otherRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: secondShopId,
        periodStart: "2099-01-01",
        periodEnd: "2099-01-15",
        deadline: "2098-12-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: NOW,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId: otherRecruitmentId,
        staffId,
        date: "2099-01-03",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { ...base, personId, staffId, positionId, otherRecruitmentId };
    });
    const actor = t.withIdentity({ subject: "user_detail_assignment" });
    const args = {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    };

    const withCrossShopAssignment = await actor.query(api.organization.userDetailQueries.getUserDetail, args);
    expect(withCrossShopAssignment).toMatchObject({
      canRemove: true,
      removalPreview: { kind: "ready", assignmentCount: 0 },
    });
    expect(withCrossShopAssignment?.memberships[0]).toMatchObject({
      staffId: ids.staffId,
      canRemove: true,
      removalPreview: { kind: "ready", assignmentCount: 0 },
    });

    await t.run(async (ctx) => await ctx.db.patch(ids.otherRecruitmentId, { isDeleted: true }));
    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toMatchObject({
      canRemove: true,
      removalPreview: { kind: "ready", assignmentCount: 0 },
    });

    await t.run(async (ctx) => {
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: ids.shopId,
        periodStart: "2099-02-01",
        periodEnd: "2099-02-15",
        deadline: "2099-01-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: NOW,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId: ids.staffId,
        date: "2099-02-03",
        startTime: "10:00",
        endTime: "18:00",
        positionId: ids.positionId,
      });
    });
    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toMatchObject({
      canRemove: true,
      removalPreview: { kind: "ready", assignmentCount: 1 },
      memberships: [{ canRemove: true, removalPreview: { kind: "ready", assignmentCount: 1 } }],
    });

    await t.run(async (ctx) => await ctx.db.patch(ids.staffId, { isDeleted: true }));
    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toMatchObject({
      canRemove: true,
      removalPreview: { kind: "ready", assignmentCount: 1 },
      memberships: [],
    });
  });

  it("課金state欠落では人物詳細をfail closedにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_read_only",
        plan: "standard",
      });
      const personId = await seedPerson(ctx, { organizationId: base.organizationId });
      const staffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: base.shopId,
      });
      const providerId = await ctx.db.insert("lineProviderUsers", {
        lineUserId: "user-detail-read-only-line-id",
        following: true,
        stateVersion: 1,
        friendshipObservedAt: NOW,
        friendshipObservationSource: "oauth",
        isDeleted: false,
      });
      await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: base.organizationId,
        organizationPersonId: personId,
        lineProviderUserId: providerId,
        generation: 0,
        linkedAt: NOW,
        isDeleted: false,
      });
      return { ...base, personId, staffId };
    });
    const actor = t.withIdentity({ subject: "user_detail_read_only" });
    const args = {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    };

    await t.run(async (ctx) => {
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (billingState) await ctx.db.delete(billingState._id);
    });
    await expect(actor.query(api.organization.userDetailQueries.getUserDetail, args)).resolves.toBeNull();
  });
});
