import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
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
    excludedFromShift: args.excludedFromShift ?? false,
    isDeleted: args.isDeleted ?? false,
  });
}

describe("organization/userDetailQueries.getUserDetail", () => {
  it("組織人物と有効店舗所属を最小DTOで返し、招待状態を同じ契約で更新する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_actor",
        shopName: "青山店",
        plan: "pro",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "赤坂店",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
      const archivedShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "archived",
        name: "旧店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: false,
      });
      await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "削除済み店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        isDeleted: true,
      });
      await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_other_organization_shop",
        shopName: "別グループ店舗",
        plan: "pro",
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
      const archivedStaffId = await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: archivedShopId,
      });
      await seedStaff(ctx, {
        organizationId: base.organizationId,
        personId,
        shopId: secondShopId,
        isDeleted: true,
      });
      await ctx.db.insert("staffLineAccounts", {
        staffId: firstStaffId,
        shopId: base.shopId,
        lineUserId: "never-return-line-user-id",
        linkedAt: NOW,
        following: true,
        isDeleted: false,
      });
      await ctx.db.insert("staffLineAccounts", {
        staffId: secondStaffId,
        shopId: base.shopId,
        lineUserId: "mismatched-shop-line-user-id",
        linkedAt: NOW,
        following: true,
        isDeleted: false,
      });
      return { ...base, personId, firstStaffId, secondStaffId, archivedShopId, archivedStaffId, secondShopId };
    });
    const actor = t.withIdentity({ subject: "user_detail_actor" });

    const result = await actor.query(api.organization.userDetailQueries.getUserDetail, {
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
      managerInvitationState: {
        kind: "available",
        mode: "addition",
        replacesStaleInvitation: false,
      },
      canRemoveManagerRole: false,
      canRemove: true,
      removalPreview: {
        kind: "ready",
        asOfDate: "2026-07-19",
        assignmentCount: 0,
        fingerprint: expect.any(String),
      },
      canWrite: true,
      membershipFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      shops: [
        {
          shopId: ids.archivedShopId,
          shopName: "旧店舗",
          shopStatus: "archived",
          canChangeMembership: false,
          membershipChangeDisabledReason: "稼働中の店舗だけ所属を変更できます。",
        },
        {
          shopId: ids.shopId,
          shopName: "青山店",
          shopStatus: "active",
          canChangeMembership: true,
        },
        {
          shopId: ids.secondShopId,
          shopName: "赤坂店",
          shopStatus: "active",
          canChangeMembership: true,
        },
      ],
      memberships: [
        {
          staffId: ids.archivedStaffId,
          shopId: ids.archivedShopId,
          shopName: "旧店舗",
          shopStatus: "archived",
          excludedFromShift: false,
          canRemove: false,
          removeDisabledReason: "稼働中の店舗だけ所属を変更できます。",
          removalPreview: {
            kind: "ready",
            asOfDate: "2026-07-19",
            assignmentCount: 0,
            fingerprint: expect.any(String),
          },
          line: { isLinked: false, isFollowing: false },
        },
        {
          staffId: ids.firstStaffId,
          shopId: ids.shopId,
          shopName: "青山店",
          shopStatus: "active",
          excludedFromShift: true,
          canRemove: true,
          removalPreview: {
            kind: "ready",
            asOfDate: "2026-07-19",
            assignmentCount: 0,
            fingerprint: expect.any(String),
          },
          line: { isLinked: true, isFollowing: true },
        },
        {
          staffId: ids.secondStaffId,
          shopId: ids.secondShopId,
          shopName: "赤坂店",
          shopStatus: "active",
          excludedFromShift: false,
          canRemove: true,
          removalPreview: {
            kind: "ready",
            asOfDate: "2026-07-19",
            assignmentCount: 0,
            fingerprint: expect.any(String),
          },
          line: { isLinked: false, isFollowing: false },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("never-return-line-user-id");
    expect(JSON.stringify(result)).not.toContain("mismatched-shop-line-user-id");

    const fromArchivedShop = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.archivedShopId,
      personId: ids.personId,
      now: NOW,
    });
    expect(fromArchivedShop?.canWrite).toBe(true);

    await t.run(async (ctx) => {
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        email: "detail-person@example.com",
        emailNormalized: "detail-person@example.com",
        tokenDigest: "never-return-invitation-token",
        status: "issued",
        purpose: "managerAddition",
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
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    });
    expect(pending).toMatchObject({
      hasManagerInvitation: true,
      managerInvitationState: { kind: "pending", mode: "addition" },
    });
    expect(JSON.stringify(pending)).not.toContain("never-return-invitation-token");
  });

  it("壊れたID、他組織人物、removed人物を同じnullへ寄せる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, { subject: "user_detail_boundary", plan: "pro" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "user_detail_other", plan: "pro" });
      const removedPersonId = await seedPerson(ctx, {
        organizationId: actor.organizationId,
        email: "removed-detail@example.com",
        status: "removed",
      });
      return { actor, other, removedPersonId };
    });
    const actor = t.withIdentity({ subject: "user_detail_boundary" });

    const invalid = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.actor.shopId,
      personId: "not-a-convex-id",
      now: NOW,
    });
    const crossOrganization = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.actor.shopId,
      personId: ids.other.personId,
      now: NOW,
    });
    const removed = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.actor.shopId,
      personId: ids.removedPersonId,
      now: NOW,
    });
    const unauthenticated = await t.query(api.organization.userDetailQueries.getUserDetail, {
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
        plan: "pro",
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
    const args = { shopId: ids.shopId, personId: ids.personId, now: NOW };

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
        plan: "pro",
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
      return { ...base, targetPersonId: personId };
    });

    const result = await t
      .withIdentity({ subject: "user_detail_manager_without_shop" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        now: NOW,
      });

    expect(result).toMatchObject({
      isSelf: false,
      managerRole: "active",
      managerInvitationState: { kind: "unavailable", reason: "このユーザーはすでに管理者です。" },
      canRemoveManagerRole: true,
      canRemove: false,
      removeDisabledReason: "先に管理者権限を外してください。",
      memberships: [],
    });

    await expect(
      t
        .withIdentity({ subject: "user_detail_manager_without_shop" })
        .query(api.organization.userDetailQueries.getUserDetail, {
          shopId: ids.shopId,
          personId: ids.targetPersonId,
          now: NOW,
          requireTargetShopMembership: true,
        }),
    ).resolves.toBeNull();

    const self = await t
      .withIdentity({ subject: "user_detail_manager_without_shop" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        shopId: ids.shopId,
        personId: ids.personId,
        now: NOW,
      });
    expect(self?.isSelf).toBe(true);
    expect(self?.person.hasLinkedAccount).toBe(true);
  });

  it("本人性を確認できないactive memberを有効な後任管理者として数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_last_valid_manager",
        plan: "pro",
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
        shopId: ids.shopId,
        personId: ids.personId,
        now: NOW,
      });

    expect(result).toMatchObject({
      isSelf: true,
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "最後の有効管理者の管理者権限は外せません。",
      canRemove: false,
      removeDisabledReason: "先に管理者権限を外してください。",
    });
  });

  it("本人性を確認できない復旧候補を引継ぎ先として数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_last_recovery_manager",
        plan: "pro",
      });
      await ctx.db.patch(base.organizationId, {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
      });

      const validUserId = await seedUser(ctx, "user_detail_valid_successor", "valid-successor@example.com");
      const validPersonId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: "valid-successor@example.com",
        userId: validUserId,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: validPersonId,
        userId: validUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });

      const invalidUserId = await seedUser(ctx, "user_detail_invalid_recovery", "invalid-recovery@example.com");
      const invalidPersonId = await seedPerson(ctx, {
        organizationId: base.organizationId,
        email: "invalid-recovery@example.com",
        userId: invalidUserId,
      });
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId: invalidPersonId,
          userId: invalidUserId,
          status: "active",
          createdAt: NOW + index,
          updatedAt: NOW + index,
        });
      }

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
          recoveryManagerPersonIds: [base.personId, invalidPersonId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: NOW,
        },
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "user_detail_last_recovery_manager" })
      .query(api.organization.userDetailQueries.getUserDetail, {
        shopId: ids.shopId,
        personId: ids.personId,
        now: NOW,
      });

    expect(result).toMatchObject({
      canRemove: false,
      removeDisabledReason: "先に管理者権限を外してください。",
    });
  });

  it("管理者所属または店舗所属が重複した不整合はnullにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_duplicates",
        plan: "pro",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_duplicates_other",
        plan: "pro",
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
    const args = { shopId: ids.shopId, personId: ids.personId, now: NOW };

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
          status: "readOnly",
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
        plan: "pro",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
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
    const args = { shopId: ids.shopId, personId: ids.personId, now: NOW };

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

  it("閲覧専用actorと課金state欠落では書き込み不可を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "user_detail_read_only",
        plan: "pro",
      });
      const personId = await seedPerson(ctx, { organizationId: base.organizationId });
      await ctx.db.patch(base.memberId, { status: "readOnly" });
      return { ...base, personId };
    });
    const actor = t.withIdentity({ subject: "user_detail_read_only" });
    const args = { shopId: ids.shopId, personId: ids.personId, now: NOW };

    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toMatchObject({
      canWrite: false,
      writeDisabledReason: "閲覧のみの管理者は、ユーザー情報を変更できません。",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.memberId, { status: "active" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (billingState) await ctx.db.delete(billingState._id);
    });
    expect(await actor.query(api.organization.userDetailQueries.getUserDetail, args)).toMatchObject({
      canWrite: false,
      writeDisabledReason: "組織の契約情報を確認中のため、ユーザー情報を変更できません。",
    });
  });
});
