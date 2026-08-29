import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { readScheduledFunctions, SCENARIO_NOW, scenarioDate } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedCanonicalStaffLineRecipient, seedOrganizationManagerShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { deriveInvitationToken } from "../organizationInvitation/token";

const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";

describe("Free管理者追加シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("既存スタッフを2人目へ追加した後は両管理者の権限・スタッフ通知・別事業者の権限を保つ", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const ownerManager = scenario.manager({
      subject: "free_addition_owner",
      email: "owner@example.com",
    });
    const addedManager = scenario.manager({
      subject: "free_addition_added_manager",
      name: "追加対象スタッフ",
      email: "added-manager@example.com",
      emailVerified: true,
    });

    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "free_addition_owner",
        email: "owner@example.com",
        shopName: "Free管理者追加対象店舗",
        plan: "free",
      });
      const ownerStaffId = await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: organization.personId,
        userId: organization.userId,
        name: "既存管理者スタッフ",
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        isDeleted: false,
      });
      const ownerLegacyMemberId = await ctx.db.insert("shopMembers", {
        shopId: organization.shopId,
        userId: organization.userId,
        role: "manager",
        isDeleted: false,
      });
      const ownerLineAccountId = await seedStaffLineAccount(ctx, {
        staffId: ownerStaffId,
        shopId: organization.shopId,
        lineUserId: "U_owner_manager_staff",
        following: true,
      });
      await seedCanonicalStaffLineRecipient(ctx, {
        staffId: ownerStaffId,
        lineUserId: "U_owner_manager_staff",
        following: true,
      });
      const unjoinedShopId = await ctx.db.insert("shops", {
        organizationId: organization.organizationId,
        name: "既存管理者がスタッフではない店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: true,
      });

      const now = Date.now();
      const otherOrganizationId = await ctx.db.insert("organizations", {
        createdByUserId: organization.userId,
        name: "別事業者",
        billingEmail: "owner@example.com",
        billingEmailNormalized: "owner@example.com",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const otherPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: otherOrganizationId,
        userId: organization.userId,
        name: "別事業者の管理者",
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const otherMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: otherOrganizationId,
        personId: otherPersonId,
        userId: organization.userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const otherShopId = await ctx.db.insert("shops", {
        organizationId: otherOrganizationId,
        name: "別事業者の店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await ctx.db.insert("organizationBillingStates", {
        organizationId: otherOrganizationId,
        state: { kind: "active", plan: "free" },
        freeManagerPersonId: otherPersonId,
        freeShopId: otherShopId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      const otherLegacyMemberId = await ctx.db.insert("shopMembers", {
        shopId: otherShopId,
        userId: organization.userId,
        role: "manager",
        isDeleted: false,
      });
      const otherStaffId = await ctx.db.insert("staffs", {
        shopId: otherShopId,
        organizationId: otherOrganizationId,
        organizationPersonId: otherPersonId,
        userId: organization.userId,
        name: "別事業者のスタッフ",
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        isDeleted: false,
      });
      return {
        ...organization,
        ownerStaffId,
        ownerLegacyMemberId,
        ownerLineAccountId,
        unjoinedShopId,
        otherOrganizationId,
        otherPersonId,
        otherMemberId,
        otherShopId,
        otherLegacyMemberId,
        otherStaffId,
      };
    });

    const [addedManagerStaffId, excludedStaffId] = await ownerManager.addStaffs([
      { name: "追加対象スタッフ", email: "added-manager@example.com" },
      { name: "シフト対象外スタッフ", email: "excluded@example.com" },
    ]);
    await ownerManager.setShiftExclusion(excludedStaffId, true);

    const beforeAddition = await t.run(async (ctx) => {
      const addedManagerStaff = await ctx.db.get(addedManagerStaffId);
      if (!addedManagerStaff?.organizationPersonId) throw new Error("追加対象スタッフが組織に紐づいていません");
      return {
        ownerPerson: await ctx.db.get(seeded.personId),
        ownerStaff: await ctx.db.get(seeded.ownerStaffId),
        ownerLineAccount: await ctx.db.get(seeded.ownerLineAccountId),
        addedManagerPersonId: addedManagerStaff.organizationPersonId,
        otherPerson: await ctx.db.get(seeded.otherPersonId),
        otherMember: await ctx.db.get(seeded.otherMemberId),
        otherLegacyMember: await ctx.db.get(seeded.otherLegacyMemberId),
        otherStaff: await ctx.db.get(seeded.otherStaffId),
      };
    });

    const created = await ownerManager.inviteStaffAsManager(addedManagerStaffId);
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("管理者追加の招待が見つかりません");
    expect(invitation).toMatchObject({
      targetPersonId: beforeAddition.addedManagerPersonId,
      status: "issued",
    });
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(addedManager.acceptManagerInvitation(token, new Set(["added-manager@example.com"]))).resolves.toEqual({
      status: "linked",
      organizationId: seeded.organizationId,
      shopId: seeded.shopId,
    });

    const afterAddition = await t.run(async (ctx) => ({
      ownerMember: await ctx.db.get(seeded.memberId),
      addedManagerMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("personId", beforeAddition.addedManagerPersonId),
        )
        .collect(),
      ownerPerson: await ctx.db.get(seeded.personId),
      ownerStaff: await ctx.db.get(seeded.ownerStaffId),
      ownerLegacyMember: await ctx.db.get(seeded.ownerLegacyMemberId),
      ownerLineAccount: await ctx.db.get(seeded.ownerLineAccountId),
      otherPerson: await ctx.db.get(seeded.otherPersonId),
      otherMember: await ctx.db.get(seeded.otherMemberId),
      otherLegacyMember: await ctx.db.get(seeded.otherLegacyMemberId),
      otherStaff: await ctx.db.get(seeded.otherStaffId),
      otherShopStaffs: await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", seeded.otherShopId).eq("isDeleted", false))
        .collect(),
      unjoinedShopStaffs: await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", seeded.unjoinedShopId).eq("isDeleted", false))
        .collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique(),
    }));
    expect(afterAddition.ownerMember?.status).toBe("active");
    expect(afterAddition.addedManagerMembers).toHaveLength(1);
    const addedManagerMember = afterAddition.addedManagerMembers[0];
    if (!addedManagerMember) throw new Error("追加後の管理者所属が見つかりません");
    if (!afterAddition.billingState) throw new Error("追加後の請求状態が見つかりません");
    expect(addedManagerMember.status).toBe("active");
    expect(afterAddition.billingState.freeManagerPersonId).toBe(seeded.personId);
    expect(afterAddition.ownerPerson).toEqual(beforeAddition.ownerPerson);
    expect(afterAddition.ownerStaff).toEqual(beforeAddition.ownerStaff);
    expect(afterAddition.ownerLineAccount).toEqual(beforeAddition.ownerLineAccount);
    expect(afterAddition.ownerLegacyMember?.isDeleted).toBe(false);
    expect(afterAddition.otherPerson).toEqual(beforeAddition.otherPerson);
    expect(afterAddition.otherMember).toEqual(beforeAddition.otherMember);
    expect(afterAddition.otherLegacyMember).toEqual(beforeAddition.otherLegacyMember);
    expect(afterAddition.otherStaff).toEqual(beforeAddition.otherStaff);
    expect(afterAddition.otherShopStaffs.map((staff) => staff._id)).toEqual([seeded.otherStaffId]);
    expect(afterAddition.unjoinedShopStaffs).toEqual([]);

    expect(
      (await readScheduledFunctions(t))
        .filter((job) => job.name === "organizationInvitation/actions:enqueueAcceptanceNotifications")
        .map((job) => job.args[0]),
    ).toEqual([
      {
        invitationId: invitation._id,
        expectedVersion: invitation.version + 1,
        organizationBillingVersionAtOrigin: afterAddition.billingState.version,
      },
    ]);
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    const acceptanceNotifications = await t.run(async (ctx) => {
      const outbox = await ctx.db.query("notificationOutbox").collect();
      return outbox.flatMap((job) => {
        if (job.payload.kind !== "email" || job.payload.context !== "organizationInvitation.linked") return [];
        return [
          {
            channel: job.channel,
            dedupeKey: job.dedupeKey,
            organizationId: job.organizationId,
            purpose: job.purpose,
            status: job.status,
            to: job.payload.to,
            userId: job.userId,
          },
        ];
      });
    });
    expect(acceptanceNotifications).toEqual([
      {
        channel: "email",
        dedupeKey: `email:organizationManagerInvitationAccepted:${invitation._id}:${invitation.version + 1}:${seeded.userId}`,
        organizationId: seeded.organizationId,
        purpose: "business",
        status: "pending",
        to: "owner@example.com",
        userId: seeded.userId,
      },
      {
        channel: "email",
        dedupeKey: `email:organizationManagerInvitationAccepted:${invitation._id}:${invitation.version + 1}:${addedManagerMember.userId}`,
        organizationId: seeded.organizationId,
        purpose: "business",
        status: "pending",
        to: "added-manager@example.com",
        userId: addedManagerMember.userId,
      },
    ]);

    const ownerIdentity = t.withIdentity({ subject: "free_addition_owner", email: "owner@example.com" });
    const ownerShops = await ownerIdentity.query(api.dashboard.queries.getMyShops, {});
    expect(ownerShops.map((shop) => shop.shopId).sort()).toEqual([seeded.shopId, seeded.otherShopId].sort());
    expect(ownerShops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          memberStatus: "active",
        }),
        expect.objectContaining({
          shopId: seeded.otherShopId,
          organizationId: seeded.otherOrganizationId,
          memberStatus: "active",
        }),
      ]),
    );

    await expect(
      ownerIdentity.mutation(api.shop.mutations.updateShopSettings, {
        shopId: seeded.shopId,
        shopName: "既存管理者が変更した店舗名",
        regularClosedDays: ["sun"],
        submissionPattern: { kind: "time", startTime: "10:00", endTime: "20:00" },
      }),
    ).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(seeded.shopId))).resolves.toMatchObject({
      name: "既存管理者が変更した店舗名",
    });

    const recruitmentId = await t
      .withIdentity({
        subject: "free_addition_added_manager",
        email: "added-manager@example.com",
        emailVerified: true,
      })
      .mutation(api.recruitment.mutations.createRecruitment, {
        shopId: seeded.shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
      });
    const recruitmentData = await t.query(internal.notification.queries.getRecruitmentEmailData, {
      recruitmentId,
    });
    expect(recruitmentData?.staffEntries.map((entry) => entry.staffId).sort()).toEqual(
      [seeded.ownerStaffId, addedManagerStaffId].sort(),
    );
    expect(recruitmentData?.staffEntries).toHaveLength(2);
    expect(recruitmentData?.staffEntries.find((entry) => entry.staffId === seeded.ownerStaffId)).toMatchObject({
      email: "owner@example.com",
      lineUserId: "U_owner_manager_staff",
      lineFollowing: true,
    });
    expect(recruitmentData?.staffEntries.map((entry) => entry.staffId)).not.toContain(excludedStaffId);
  });

  it("既存管理者がシフト対象外なら2人目追加後も募集通知のrecipientに含めない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const ownerManager = scenario.manager({ subject: "excluded_owner", email: "excluded-owner@example.com" });
    const addedManager = scenario.manager({
      subject: "excluded_added_manager",
      email: "excluded-added-manager@example.com",
      emailVerified: true,
    });
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "excluded_owner",
        email: "excluded-owner@example.com",
        plan: "free",
      });
      const ownerStaffId = await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: organization.personId,
        userId: organization.userId,
        name: "シフト対象外の既存管理者",
        email: "excluded-owner@example.com",
        emailNormalized: "excluded-owner@example.com",
        excludedFromShift: true,
        isDeleted: false,
      });
      return { ...organization, ownerStaffId };
    });
    const [addedManagerStaffId] = await ownerManager.addStaffs([
      { name: "追加対象スタッフ", email: "excluded-added-manager@example.com" },
    ]);
    const ownerStaffBefore = await t.run((ctx) => ctx.db.get(seeded.ownerStaffId));
    const created = await ownerManager.inviteStaffAsManager(addedManagerStaffId);
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("管理者追加の招待が見つかりません");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      addedManager.acceptManagerInvitation(token, new Set(["excluded-added-manager@example.com"])),
    ).resolves.toMatchObject({ status: "linked" });
    expect(await t.run((ctx) => ctx.db.get(seeded.ownerStaffId))).toEqual(ownerStaffBefore);
    expect(ownerStaffBefore?.excludedFromShift).toBe(true);

    const recruitmentId = await addedManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });
    const recruitmentData = await t.query(internal.notification.queries.getRecruitmentEmailData, {
      recruitmentId,
    });
    expect(recruitmentData?.staffEntries.map((entry) => entry.staffId)).toEqual([addedManagerStaffId]);
    expect(recruitmentData?.staffEntries).toHaveLength(1);
    expect(recruitmentData?.staffEntries.map((entry) => entry.staffId)).not.toContain(seeded.ownerStaffId);
  });
});
