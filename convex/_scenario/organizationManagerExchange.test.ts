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
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("既存スタッフを2人目へ追加した後は両管理者の権限・スタッフ通知・別事業者の権限を保つ", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const formerManager = scenario.manager({
      subject: "free_exchange_former",
      email: "former@example.com",
    });
    const successor = scenario.manager({
      subject: "free_exchange_successor",
      name: "交代先スタッフ",
      email: "successor@example.com",
      emailVerified: true,
    });

    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "free_exchange_former",
        email: "former@example.com",
        shopName: "Free管理者追加対象店舗",
        plan: "free",
      });
      const formerStaffId = await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: organization.personId,
        userId: organization.userId,
        name: "元管理者スタッフ",
        email: "former@example.com",
        emailNormalized: "former@example.com",
        isDeleted: false,
      });
      const formerLegacyMemberId = await ctx.db.insert("shopMembers", {
        shopId: organization.shopId,
        userId: organization.userId,
        role: "manager",
        isDeleted: false,
      });
      const formerLineAccountId = await seedStaffLineAccount(ctx, {
        staffId: formerStaffId,
        shopId: organization.shopId,
        lineUserId: "U_former_manager_staff",
        following: true,
      });
      await seedCanonicalStaffLineRecipient(ctx, {
        staffId: formerStaffId,
        lineUserId: "U_former_manager_staff",
        following: true,
      });
      const unjoinedShopId = await ctx.db.insert("shops", {
        organizationId: organization.organizationId,
        operatingStatus: "archived",
        name: "元管理者がスタッフではない店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });

      const now = Date.now();
      const otherOrganizationId = await ctx.db.insert("organizations", {
        createdByUserId: organization.userId,
        name: "別事業者",
        billingEmail: "former@example.com",
        billingEmailNormalized: "former@example.com",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const otherPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: otherOrganizationId,
        userId: organization.userId,
        name: "別事業者の管理者",
        email: "former@example.com",
        emailNormalized: "former@example.com",
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
        operatingStatus: "active",
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
        email: "former@example.com",
        emailNormalized: "former@example.com",
        isDeleted: false,
      });
      return {
        ...organization,
        formerStaffId,
        formerLegacyMemberId,
        formerLineAccountId,
        unjoinedShopId,
        otherOrganizationId,
        otherPersonId,
        otherMemberId,
        otherShopId,
        otherLegacyMemberId,
        otherStaffId,
      };
    });

    const [successorStaffId, excludedStaffId] = await formerManager.addStaffs([
      { name: "交代先スタッフ", email: "successor@example.com" },
      { name: "シフト対象外スタッフ", email: "excluded@example.com" },
    ]);
    await formerManager.setShiftExclusion(excludedStaffId, true);

    const beforeExchange = await t.run(async (ctx) => {
      const successorStaff = await ctx.db.get(successorStaffId);
      if (!successorStaff?.organizationPersonId) throw new Error("交代先スタッフが組織に紐づいていません");
      return {
        formerPerson: await ctx.db.get(seeded.personId),
        formerStaff: await ctx.db.get(seeded.formerStaffId),
        formerLineAccount: await ctx.db.get(seeded.formerLineAccountId),
        successorPersonId: successorStaff.organizationPersonId,
        otherPerson: await ctx.db.get(seeded.otherPersonId),
        otherMember: await ctx.db.get(seeded.otherMemberId),
        otherLegacyMember: await ctx.db.get(seeded.otherLegacyMemberId),
        otherStaff: await ctx.db.get(seeded.otherStaffId),
      };
    });

    const created = await formerManager.inviteStaffAsManager(successorStaffId);
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("管理者交代の招待が見つかりません");
    expect(invitation).toMatchObject({
      targetPersonId: beforeExchange.successorPersonId,
      purpose: "managerAddition",
      status: "issued",
    });
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(successor.acceptManagerInvitation(token, new Set(["successor@example.com"]))).resolves.toEqual({
      status: "linked",
      organizationId: seeded.organizationId,
      shopId: seeded.shopId,
    });

    const afterExchange = await t.run(async (ctx) => ({
      formerMember: await ctx.db.get(seeded.memberId),
      successorMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("personId", beforeExchange.successorPersonId),
        )
        .collect(),
      formerPerson: await ctx.db.get(seeded.personId),
      formerStaff: await ctx.db.get(seeded.formerStaffId),
      formerLegacyMember: await ctx.db.get(seeded.formerLegacyMemberId),
      formerLineAccount: await ctx.db.get(seeded.formerLineAccountId),
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
    expect(afterExchange.formerMember?.status).toBe("active");
    expect(afterExchange.successorMembers).toHaveLength(1);
    const successorMember = afterExchange.successorMembers[0];
    if (!successorMember) throw new Error("交代後の管理者所属が見つかりません");
    if (!afterExchange.billingState) throw new Error("交代後の請求状態が見つかりません");
    expect(successorMember.status).toBe("active");
    expect(afterExchange.billingState.freeManagerPersonId).toBe(seeded.personId);
    expect(afterExchange.formerPerson).toEqual(beforeExchange.formerPerson);
    expect(afterExchange.formerStaff).toEqual(beforeExchange.formerStaff);
    expect(afterExchange.formerLineAccount).toEqual(beforeExchange.formerLineAccount);
    expect(afterExchange.formerLegacyMember?.isDeleted).toBe(false);
    expect(afterExchange.otherPerson).toEqual(beforeExchange.otherPerson);
    expect(afterExchange.otherMember).toEqual(beforeExchange.otherMember);
    expect(afterExchange.otherLegacyMember).toEqual(beforeExchange.otherLegacyMember);
    expect(afterExchange.otherStaff).toEqual(beforeExchange.otherStaff);
    expect(afterExchange.otherShopStaffs.map((staff) => staff._id)).toEqual([seeded.otherStaffId]);
    expect(afterExchange.unjoinedShopStaffs).toEqual([]);

    expect(
      (await readScheduledFunctions(t))
        .filter((job) => job.name === "organizationInvitation/actions:enqueueAcceptanceNotifications")
        .map((job) => job.args[0]),
    ).toEqual([
      {
        invitationId: invitation._id,
        expectedVersion: invitation.version + 1,
        organizationBillingVersionAtOrigin: afterExchange.billingState.version,
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
        to: "former@example.com",
        userId: seeded.userId,
      },
      {
        channel: "email",
        dedupeKey: `email:organizationManagerInvitationAccepted:${invitation._id}:${invitation.version + 1}:${successorMember.userId}`,
        organizationId: seeded.organizationId,
        purpose: "business",
        status: "pending",
        to: "successor@example.com",
        userId: successorMember.userId,
      },
    ]);

    const formerIdentity = t.withIdentity({ subject: "free_exchange_former", email: "former@example.com" });
    const formerShops = await formerIdentity.query(api.dashboard.queries.getMyShops, {});
    expect(formerShops.map((shop) => shop.shopId).sort()).toEqual(
      [seeded.shopId, seeded.unjoinedShopId, seeded.otherShopId].sort(),
    );
    expect(formerShops).toEqual(
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
      formerIdentity.mutation(api.shop.mutations.updateShopSettings, {
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
        subject: "free_exchange_successor",
        email: "successor@example.com",
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
      [seeded.formerStaffId, successorStaffId].sort(),
    );
    expect(recruitmentData?.staffEntries).toHaveLength(2);
    expect(recruitmentData?.staffEntries.find((entry) => entry.staffId === seeded.formerStaffId)).toMatchObject({
      email: "former@example.com",
      lineUserId: "U_former_manager_staff",
      lineFollowing: true,
    });
    expect(recruitmentData?.staffEntries.map((entry) => entry.staffId)).not.toContain(excludedStaffId);
  });

  it("既存管理者がシフト対象外なら2人目追加後も募集通知のrecipientに含めない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const formerManager = scenario.manager({ subject: "excluded_former", email: "excluded-former@example.com" });
    const successor = scenario.manager({
      subject: "excluded_successor",
      email: "excluded-successor@example.com",
      emailVerified: true,
    });
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "excluded_former",
        email: "excluded-former@example.com",
        plan: "free",
      });
      const formerStaffId = await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: organization.personId,
        userId: organization.userId,
        name: "シフト対象外の元管理者",
        email: "excluded-former@example.com",
        emailNormalized: "excluded-former@example.com",
        excludedFromShift: true,
        isDeleted: false,
      });
      return { ...organization, formerStaffId };
    });
    const [successorStaffId] = await formerManager.addStaffs([
      { name: "交代先スタッフ", email: "excluded-successor@example.com" },
    ]);
    const formerStaffBefore = await t.run((ctx) => ctx.db.get(seeded.formerStaffId));
    const created = await formerManager.inviteStaffAsManager(successorStaffId);
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("管理者交代の招待が見つかりません");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      successor.acceptManagerInvitation(token, new Set(["excluded-successor@example.com"])),
    ).resolves.toMatchObject({ status: "linked" });
    expect(await t.run((ctx) => ctx.db.get(seeded.formerStaffId))).toEqual(formerStaffBefore);
    expect(formerStaffBefore?.excludedFromShift).toBe(true);

    const recruitmentId = await successor.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });
    const recruitmentData = await t.query(internal.notification.queries.getRecruitmentEmailData, {
      recruitmentId,
    });
    expect(recruitmentData?.staffEntries.map((entry) => entry.staffId)).toEqual([successorStaffId]);
    expect(recruitmentData?.staffEntries).toHaveLength(1);
    expect(recruitmentData?.staffEntries.map((entry) => entry.staffId)).not.toContain(seeded.formerStaffId);
  });
});
