import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { rateLimit } from "./_lib/rateLimits";
import { modules, schema } from "./_test/setup.test-helper";
import { digestInvitationToken, invitationRateLimitKey } from "./organizationInvitation/token";

const DATES = {
  periodStart: "2037-04-07",
  periodEnd: "2037-04-13",
  deadline: "2037-04-06",
  dates: ["2037-04-07", "2037-04-08", "2037-04-09", "2037-04-10", "2037-04-11", "2037-04-12", "2037-04-13"],
};

describe("E2E testing helpers", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://e2e-test.convex.cloud");
    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://e2e-test.convex.cloud");
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "dry-run");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("明示enableがないdeploymentでは破壊的helperを拒否する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.testing.clearAllTables, {})).rejects.toThrow(
      "E2E testing helpers are disabled for this deployment.",
    );
  });

  it("許可URLと現在deploymentが一致しない場合もhelperを拒否する", async () => {
    vi.stubEnv("E2E_TESTING_DEPLOYMENT_URL", "https://another.convex.cloud");
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.testing.seedNotificationSubmitScenario, {
        managerAuthTokenIdentifier: "issuer|mismatch",
        managerEmail: "mismatch@example.com",
        dates: DATES,
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
  });

  it("許可deployment以外では新しいactor所有seedも拒否する", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.testing.seedAuthenticatedManagerScenario, {
        managerAuthTokenIdentifier: "issuer|disabled-auth",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
    await expect(
      t.mutation(internal.testing.seedShopLifecycleScenario, {
        managerAuthTokenIdentifier: "issuer|disabled-shop",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
    await expect(
      t.mutation(internal.testing.seedShopStaffMembershipScenario, {
        managerAuthTokenIdentifier: "issuer|disabled-membership",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
    await expect(
      t.mutation(internal.testing.seedManagerSettingsScenario, {
        managerAuthTokenIdentifier: "issuer|disabled-manager-settings",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
    await expect(
      t.mutation(internal.testing.seedStaffLifecycleScenario, {
        managerAuthTokenIdentifier: "issuer|disabled-staff-lifecycle",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
    await expect(
      t.mutation(internal.testing.seedManagerLifecycleScenario, {
        managerAuthTokenIdentifier: "issuer|disabled-manager-lifecycle-a",
        inviteeAuthTokenIdentifier: "issuer|disabled-manager-lifecycle-b",
        inviteeEmail: "disabled-manager-lifecycle-b@example.test",
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
    await expect(
      t.query(internal.testing.getManagerInvitationCapability, {
        organizationId: "0000000000000000000organizations" as Id<"organizations">,
        targetPersonId: "0000000000000000000organizationPeople" as Id<"organizationPeople">,
      }),
    ).rejects.toThrow("E2E testing helpers are disabled for this deployment.");
  });

  it("clearAllTablesは指定tableをbounded batchで削除する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authTokenIdentifier: "issuer|clear",
        name: "Clear Target",
        email: "clear@example.com",
        emailNormalized: "clear@example.com",
        role: "manager",
        isDeleted: false,
      });
    });

    const result = await t.mutation(internal.testing.clearAllTables, { tableName: "users" });

    expect(result).toMatchObject({ cleared: ["users"], deleted: 1 });
  });

  it("通常manager seedはowner graphを再利用せず、通知をdry-runへ閉じる", async () => {
    const t = convexTest(schema, modules);
    const args = {
      managerAuthTokenIdentifier: "issuer|core-owner",
      managerEmail: "core-owner@example.com",
      dates: DATES,
    };

    const first = await t.mutation(internal.testing.seedNotificationSubmitScenario, args);
    const second = await t.mutation(internal.testing.seedNotificationSubmitScenario, args);
    const safety = await t.query(internal.testing.getE2EShopSafetyState, { shopId: second.shopId });
    const state = await t.run(async (ctx) => ({
      activeOrganizations: (await ctx.db.query("organizations").collect()).filter(
        (organization) => !organization.isDeleted,
      ),
      firstShop: await ctx.db.get(first.shopId),
      secondShop: await ctx.db.get(second.shopId),
    }));

    expect(safety).toEqual({ notificationDeliverySuppressed: true });
    expect(state.activeOrganizations).toHaveLength(1);
    expect(state.firstShop).toBeNull();
    expect(state.secondShop?.isDeleted).toBe(false);
  });

  it("resetは指定owner graphだけを回収する", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.testing.seedNotificationSubmitScenario, {
      managerAuthTokenIdentifier: "issuer|owner-a",
      managerEmail: "owner-a@example.com",
      dates: DATES,
    });
    const ownerB = await t.mutation(internal.testing.seedNotificationSubmitScenario, {
      managerAuthTokenIdentifier: "issuer|owner-b",
      managerEmail: "owner-b@example.com",
      dates: DATES,
    });

    await t.mutation(internal.testing.resetManagerScenarioData, {
      managerAuthTokenIdentifier: "issuer|owner-a",
    });

    const state = await t.run(async (ctx) => ({
      ownerA: await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", "issuer|owner-a"))
        .unique(),
      ownerB: await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", "issuer|owner-b"))
        .unique(),
      ownerBShop: await ctx.db.get(ownerB.shopId),
    }));
    expect(state.ownerA).toBeNull();
    expect(state.ownerB?.isDeleted).toBe(false);
    expect(state.ownerBShop?.isDeleted).toBe(false);
  });

  it("resetは店舗scopeと組織scopeのOutboxを消す前にdelivery_delayed期限も回収する", async () => {
    const t = convexTest(schema, modules);
    const ownerA = await t.mutation(internal.testing.seedNotificationSubmitScenario, {
      managerAuthTokenIdentifier: "issuer|delayed-reset-owner-a",
      managerEmail: "delayed-reset-owner-a@example.com",
      dates: DATES,
    });
    const ownerB = await t.mutation(internal.testing.seedNotificationSubmitScenario, {
      managerAuthTokenIdentifier: "issuer|delayed-reset-owner-b",
      managerEmail: "delayed-reset-owner-b@example.com",
      dates: DATES,
    });
    const ids = await t.run(async (ctx) => {
      const ownerAShop = await ctx.db.get(ownerA.shopId);
      const ownerBShop = await ctx.db.get(ownerB.shopId);
      if (!ownerAShop?.organizationId || !ownerBShop?.organizationId) {
        throw new Error("reset scenario organization is missing");
      }
      const now = Date.now();
      const insertDelayedOutbox = async (
        scope: { shopId?: Id<"shops">; organizationId: Id<"organizations"> },
        key: string,
      ) => {
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `email:e2e-delayed-reset:${key}`,
          ...scope,
          purpose: "business",
          notificationContext: "testing.delayedReset",
          deliverySuppressed: true,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: `${key}@example.com`,
            subject: "reset test",
            html: "<p>reset test</p>",
            context: "testing.delayedReset",
            suppressDelivery: true,
          },
          attemptCount: 1,
          nextRunAt: now,
          sentAt: now,
          resendEmailId: `email_delayed_reset_${key}`,
          resendLastEventType: "email.delivery_delayed",
          resendLastEventAt: now,
          resendDeliveryStatus: "delivery_delayed",
          createdAt: now,
          updatedAt: now,
        });
        const deadlineId = await ctx.db.insert("notificationResendDelayedFailureDeadlines", {
          outboxId,
          dueAt: now + 30 * 60_000,
          createdAt: now,
        });
        return { outboxId, deadlineId };
      };
      const ownerAShopScoped = await insertDelayedOutbox(
        { organizationId: ownerAShop.organizationId, shopId: ownerA.shopId },
        "owner-a-shop",
      );
      const ownerAOrganizationScoped = await insertDelayedOutbox(
        { organizationId: ownerAShop.organizationId },
        "owner-a-organization",
      );
      const ownerBShopScoped = await insertDelayedOutbox(
        { organizationId: ownerBShop.organizationId, shopId: ownerB.shopId },
        "owner-b-shop",
      );
      return { ownerAShopScoped, ownerAOrganizationScoped, ownerBShopScoped };
    });

    await t.mutation(internal.testing.resetManagerScenarioData, {
      managerAuthTokenIdentifier: "issuer|delayed-reset-owner-a",
    });

    const state = await t.run(async (ctx) => ({
      ownerAShopOutbox: await ctx.db.get(ids.ownerAShopScoped.outboxId),
      ownerAOrganizationOutbox: await ctx.db.get(ids.ownerAOrganizationScoped.outboxId),
      ownerAShopDeadline: await ctx.db.get(ids.ownerAShopScoped.deadlineId),
      ownerAOrganizationDeadline: await ctx.db.get(ids.ownerAOrganizationScoped.deadlineId),
      ownerBShopOutbox: await ctx.db.get(ids.ownerBShopScoped.outboxId),
      ownerBShopDeadline: await ctx.db.get(ids.ownerBShopScoped.deadlineId),
    }));
    expect(state).toEqual({
      ownerAShopOutbox: null,
      ownerAOrganizationOutbox: null,
      ownerAShopDeadline: null,
      ownerAOrganizationDeadline: null,
      ownerBShopOutbox: expect.objectContaining({ shopId: ownerB.shopId }),
      ownerBShopDeadline: expect.objectContaining({ outboxId: ids.ownerBShopScoped.outboxId }),
    });
  });

  it("single actor tenant seedは2組織を再実行可能に作る", async () => {
    const t = convexTest(schema, modules);
    const args = {
      actorAManagerAuthTokenIdentifier: "issuer|tenant-a",
      actorAManagerEmail: "tenant-a@example.com",
      actorBManagerAuthTokenIdentifier: "issuer|tenant-marker-b",
      actorBManagerEmail: "tenant-marker-b@example.com",
      actorCManagerAuthTokenIdentifier: "issuer|tenant-marker-c",
    };

    await t.mutation(internal.testing.seedFreeManagerMultiOrganizationScenario, args);
    const second = await t.mutation(internal.testing.seedFreeManagerMultiOrganizationScenario, args);
    const state = await t.run(async (ctx) => ({
      organizations: (await ctx.db.query("organizations").collect()).filter((organization) => !organization.isDeleted),
      targetShop: await ctx.db.get(second.targetShopId),
      alternateShop: await ctx.db.get(second.alternateShopId),
    }));

    expect(state.organizations).toHaveLength(2);
    expect(state.targetShop?.organizationId).not.toBe(state.alternateShop?.organizationId);
  });

  it("認証境界seedは指定actorの旧graphだけを回収する", async () => {
    const t = convexTest(schema, modules);
    const otherOwner = await t.mutation(internal.testing.seedAuthenticatedManagerScenario, {
      managerAuthTokenIdentifier: "issuer|auth-owner-b",
      managerEmail: "auth-owner-b@example.com",
    });
    const first = await t.mutation(internal.testing.seedAuthenticatedManagerScenario, {
      managerAuthTokenIdentifier: "issuer|auth-owner-a",
      managerEmail: "auth-owner-a@example.com",
    });
    const second = await t.mutation(internal.testing.seedAuthenticatedManagerScenario, {
      managerAuthTokenIdentifier: "issuer|auth-owner-a",
      managerEmail: "auth-owner-a@example.com",
    });

    const state = await t.run(async (ctx) => ({
      firstShop: await ctx.db.get(first.shopId),
      secondShop: await ctx.db.get(second.shopId),
      otherOwnerShop: await ctx.db.get(otherOwner.shopId),
    }));
    expect(state.firstShop).toBeNull();
    expect(state.secondShop?.isDeleted).toBe(false);
    expect(state.otherOwnerShop?.isDeleted).toBe(false);
  });

  it("店舗ライフサイクルseedは再seedで旧graphを回収し、別ownerに影響しない", async () => {
    const t = convexTest(schema, modules);
    const otherOwner = await t.mutation(internal.testing.seedAuthenticatedManagerScenario, {
      managerAuthTokenIdentifier: "issuer|shop-owner-b",
      managerEmail: "shop-owner-b@example.com",
    });
    const args = {
      managerAuthTokenIdentifier: "issuer|shop-owner-a",
      managerEmail: "shop-owner-a@example.com",
      organizationName: "E2E 店舗管理グループ",
      shopName: "E2E 元店舗",
    };
    const first = await t.mutation(internal.testing.seedShopLifecycleScenario, args);
    const second = await t.mutation(internal.testing.seedShopLifecycleScenario, args);
    const organizationFeatureRequestId = await t.run((ctx) =>
      ctx.db.insert("featureRequests", {
        organizationId: second.organizationId,
        comment: "組織scopeのE2E要望",
        requestId: "testing-reset-organization-feature-request",
      }),
    );

    const reseeded = await t.run(async (ctx) => ({
      firstOrganization: await ctx.db.get(first.organizationId),
      firstShop: await ctx.db.get(first.shopId),
      secondOrganization: await ctx.db.get(second.organizationId),
      secondShop: await ctx.db.get(second.shopId),
      otherOwnerShop: await ctx.db.get(otherOwner.shopId),
    }));
    expect(reseeded.firstOrganization).toBeNull();
    expect(reseeded.firstShop).toBeNull();
    expect(reseeded.secondOrganization?.isDeleted).toBe(false);
    expect(reseeded.secondShop?.name).toBe(args.shopName);
    expect(reseeded.otherOwnerShop?.isDeleted).toBe(false);
    expect(second.managerName).toBe("田中太郎");

    await t.mutation(internal.testing.resetManagerScenarioData, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
    });
    const reset = await t.run(async (ctx) => ({
      secondOrganization: await ctx.db.get(second.organizationId),
      secondShop: await ctx.db.get(second.shopId),
      organizationFeatureRequest: await ctx.db.get(organizationFeatureRequestId),
      otherOwnerShop: await ctx.db.get(otherOwner.shopId),
    }));
    expect(reset.secondOrganization).toBeNull();
    expect(reset.secondShop).toBeNull();
    expect(reset.organizationFeatureRequest).toBeNull();
    expect(reset.otherOwnerShop?.isDeleted).toBe(false);
  });

  it("所属変更seedはA店とB店の前提を再作成し、指定actorだけをresetできる", async () => {
    const t = convexTest(schema, modules);
    const otherOwner = await t.mutation(internal.testing.seedAuthenticatedManagerScenario, {
      managerAuthTokenIdentifier: "issuer|membership-owner-b",
      managerEmail: "membership-owner-b@example.com",
    });
    const args = {
      managerAuthTokenIdentifier: "issuer|membership-owner-a",
      managerEmail: "membership-owner-a@example.com",
    };
    const first = await t.mutation(internal.testing.seedShopStaffMembershipScenario, args);
    const second = await t.mutation(internal.testing.seedShopStaffMembershipScenario, args);

    const reseeded = await t.run(async (ctx) => {
      const contextStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", second.contextShopId).eq("isDeleted", false))
        .collect();
      const targetStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", second.targetShopId).eq("isDeleted", false))
        .collect();
      return {
        firstOrganization: await ctx.db.get(first.organizationId),
        firstContextShop: await ctx.db.get(first.contextShopId),
        firstTargetShop: await ctx.db.get(first.targetShopId),
        secondOrganization: await ctx.db.get(second.organizationId),
        otherOwnerShop: await ctx.db.get(otherOwner.shopId),
        contextStaffs,
        targetStaffs,
      };
    });
    expect(reseeded.firstOrganization).toBeNull();
    expect(reseeded.firstContextShop).toBeNull();
    expect(reseeded.firstTargetShop).toBeNull();
    expect(reseeded.secondOrganization?.isDeleted).toBe(false);
    expect(reseeded.otherOwnerShop?.isDeleted).toBe(false);
    expect(reseeded.contextStaffs.map((staff) => staff.name).sort()).toEqual(["田中太郎", "追加候補スタッフ"]);
    expect(reseeded.targetStaffs.map((staff) => staff.name)).toEqual(["既存所属スタッフ"]);

    await t.mutation(internal.testing.resetManagerScenarioData, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
    });
    const reset = await t.run(async (ctx) => ({
      secondOrganization: await ctx.db.get(second.organizationId),
      otherOwnerShop: await ctx.db.get(otherOwner.shopId),
    }));
    expect(reset.secondOrganization).toBeNull();
    expect(reset.otherOwnerShop?.isDeleted).toBe(false);
  });

  it("管理者設定seedは非管理者staffを作り、既存resetでactor所有graphを回収する", async () => {
    const t = convexTest(schema, modules);
    const args = {
      managerAuthTokenIdentifier: "issuer|manager-settings-owner",
      managerEmail: "manager-settings-owner@example.test",
    };
    const seed = await t.mutation(internal.testing.seedManagerSettingsScenario, args);
    const before = await t.run(async (ctx) => {
      const shop = await ctx.db.get(seed.shopId);
      if (!shop?.organizationId) throw new Error("manager settings scenario shop is missing");
      const organizationId = shop.organizationId;
      const candidatePeople = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", organizationId).eq("emailNormalized", seed.candidateEmail),
        )
        .collect();
      return { shop, candidatePeople };
    });

    expect(seed).toMatchObject({
      organizationId: before.shop?.organizationId,
      organizationName: "管理者設定テストグループ",
      currentManagerName: "田中太郎",
      candidateName: "管理者候補スタッフ",
      candidateEmail: "manager-candidate@example.test",
    });
    expect(before.shop?.isDeleted).toBe(false);
    expect(before.candidatePeople).toHaveLength(1);
    expect(before.candidatePeople[0].userId).toBeUndefined();

    await t.mutation(internal.testing.resetManagerScenarioData, {
      managerAuthTokenIdentifier: args.managerAuthTokenIdentifier,
    });
    expect(await t.run((ctx) => ctx.db.get(seed.shopId))).toBeNull();
  });

  it("スタッフライフサイクルseedは手入力追加前のactor所有組織と安全な宛先を返す", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.mutation(internal.testing.seedStaffLifecycleScenario, {
      managerAuthTokenIdentifier: "issuer|staff-lifecycle-owner",
      managerEmail: "staff-lifecycle-owner@example.test",
    });

    expect(seed).toMatchObject({
      shopName: "スタッフライフサイクルテスト店舗",
      organizationName: "スタッフライフサイクルテストグループ",
      staffName: "E2E 新規スタッフ",
      staffEmail: "staff-lifecycle@example.test",
    });
    expect(await t.run((ctx) => ctx.db.get(seed.organizationId))).toMatchObject({
      name: "スタッフライフサイクルテストグループ",
      isDeleted: false,
    });
    expect(await t.run((ctx) => ctx.db.get(seed.shopId))).toMatchObject({
      name: "スタッフライフサイクルテスト店舗",
      isDeleted: false,
    });
  });

  it("管理者ライフサイクルseedは別actorを未接続staffとして作り、capabilityは発行前にnullを返す", async () => {
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", "e2e-manager-lifecycle-signing-secret-000000000000");
    const t = convexTest(schema, modules);
    const managerSubject = "manager-lifecycle-a";
    const seed = await t.mutation(internal.testing.seedManagerLifecycleScenario, {
      managerAuthTokenIdentifier: `https://convex.test|${managerSubject}`,
      managerEmail: "manager-lifecycle-a@example.test",
      inviteeAuthTokenIdentifier: "issuer|manager-lifecycle-b",
      inviteeEmail: "manager-lifecycle-b@example.test",
    });

    const beforeIssue = await t.query(internal.testing.getManagerInvitationCapability, {
      organizationId: seed.organizationId,
      targetPersonId: seed.candidatePersonId,
    });
    const state = await t.run(async (ctx) => {
      const person = await ctx.db.get(seed.candidatePersonId);
      const staffs = await ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", seed.organizationId).eq("organizationPersonId", seed.candidatePersonId),
        )
        .collect();
      return { person, staffs };
    });

    expect(beforeIssue).toEqual({ token: null });
    expect(state.person).toMatchObject({
      name: seed.candidateName,
      email: seed.candidateEmail,
      status: "active",
    });
    expect(state.person?.userId).toBeUndefined();
    expect(state.staffs).toHaveLength(1);
    expect(state.staffs[0]).toMatchObject({ shopId: seed.shopId, isDeleted: false });

    await t
      .withIdentity({ subject: managerSubject })
      .mutation(api.organizationInvitation.mutations.issueForOrganization, {
        organizationId: seed.organizationId,
        recipient: { kind: "existingStaff", personId: seed.candidatePersonId },
        requestId: "e2e-manager-lifecycle-capability",
      });
    const afterIssue = await t.query(internal.testing.getManagerInvitationCapability, {
      organizationId: seed.organizationId,
      targetPersonId: seed.candidatePersonId,
    });

    expect(afterIssue).toEqual({ token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });

    const invitation = await t.run(async (ctx) => {
      const result = await ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_targetPersonId_and_status", (q) =>
          q
            .eq("organizationId", seed.organizationId)
            .eq("targetPersonId", seed.candidatePersonId)
            .eq("status", "issued"),
        )
        .unique();
      if (!result) throw new Error("manager lifecycle invitation was not issued");
      await ctx.db.patch(result._id, { tokenDigest: "0".repeat(64) });
      return result;
    });
    await expect(
      t.query(internal.testing.getManagerInvitationCapability, {
        organizationId: seed.organizationId,
        targetPersonId: seed.candidatePersonId,
      }),
    ).rejects.toThrow("manager-invitation-digest-mismatch");

    await t.run(async (ctx) => {
      const duplicate = { ...invitation, tokenDigest: "1".repeat(64) };
      Reflect.deleteProperty(duplicate, "_id");
      Reflect.deleteProperty(duplicate, "_creationTime");
      await ctx.db.insert("organizationInvitations", duplicate);
    });
    await expect(
      t.query(internal.testing.getManagerInvitationCapability, {
        organizationId: seed.organizationId,
        targetPersonId: seed.candidatePersonId,
      }),
    ).rejects.toThrow("ambiguous-manager-invitation");
  });

  it("actor resetは招待受諾のactor bucketだけを同じ本番keyで回収する", async () => {
    const t = convexTest(schema, modules);
    const authTokenIdentifier = "issuer|manager-lifecycle-rate-limit";
    const key = invitationRateLimitKey(await digestInvitationToken(`actor:${authTokenIdentifier}`));
    await t.run(async (ctx) => {
      await rateLimit(ctx, { name: "organizationManagerInviteAcceptActor", key });
      await rateLimit(ctx, { name: "organizationManagerInviteAccept", key });
    });

    await t.mutation(internal.testing.resetManagerScenarioData, {
      managerAuthTokenIdentifier: authTokenIdentifier,
    });

    const remaining = await t.run(async (ctx) =>
      (await ctx.db.query("rateLimits").collect()).map(({ name, key: rowKey }) => ({ name, key: rowKey })),
    );
    expect(remaining).toEqual([{ name: "organizationManagerInviteAccept", key }]);
  });

  it("capability helperは最新募集へ最小DTOのtokenを発行する", async () => {
    const t = convexTest(schema, modules);
    const managerEmail = "capability-owner@example.com";
    const seed = await t.mutation(internal.testing.seedOpenRecruitmentNotificationScenario, {
      managerAuthTokenIdentifier: "issuer|capability-owner",
      managerEmail,
      dates: DATES,
    });

    const created = await t.mutation(internal.testing.createMagicLinkTokenForLatestRecruitment, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "submit",
    });
    const latest = await t.query(internal.testing.getLatestMagicLinkToken, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "submit",
    });

    expect(Object.keys(created).sort()).toEqual(["recruitmentId", "staffId", "token"]);
    expect(latest).toMatchObject({
      token: created.token,
      recruitmentId: seed.recruitmentId,
      staffId: seed.staffId,
      usedAt: null,
    });
  });

  it("view capability lookupは確定募集のsubmit linkを返さない", async () => {
    const t = convexTest(schema, modules);
    const managerEmail = "view-capability-owner@example.com";
    const seed = await t.mutation(internal.testing.seedOpenRecruitmentNotificationScenario, {
      managerAuthTokenIdentifier: "issuer|view-capability-owner",
      managerEmail,
      dates: DATES,
    });
    const submitLink = await t.mutation(internal.testing.createMagicLinkTokenForLatestRecruitment, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "submit",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(seed.recruitmentId, { status: "confirmed", confirmedAt: Date.now() });
    });

    const withoutViewLink = await t.query(internal.testing.getLatestMagicLinkToken, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "view",
    });

    expect(withoutViewLink).toEqual({ token: null });

    await t.run(async (ctx) => {
      await ctx.db.patch(seed.recruitmentId, { status: "open", confirmedAt: undefined });
    });
    const reopenedSubmitLink = await t.query(internal.testing.getLatestMagicLinkToken, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "submit",
    });

    expect(reopenedSubmitLink).toMatchObject({
      token: submitLink.token,
      staffId: seed.staffId,
      recruitmentId: seed.recruitmentId,
      usedAt: null,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(seed.recruitmentId, { status: "confirmed", confirmedAt: Date.now() });
    });

    const viewLink = await t.run(async (ctx) => {
      const token = "view-capability-token";
      const expiresAt = Date.now() + 60_000;
      await ctx.db.insert("magicLinks", {
        token,
        staffId: seed.staffId,
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        accessKind: "view",
        expiresAt,
      });
      return { token, expiresAt };
    });
    const withViewLink = await t.query(internal.testing.getLatestMagicLinkToken, {
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: managerEmail,
      purpose: "view",
    });

    expect(withViewLink).toEqual({
      token: viewLink.token,
      staffId: seed.staffId,
      recruitmentId: seed.recruitmentId,
      expiresAt: viewLink.expiresAt,
      usedAt: null,
    });
  });

  it("capability helperの失敗messageへemailを含めない", async () => {
    const t = convexTest(schema, modules);
    const missingEmail = "missing-person@example.com";

    let caught: unknown;
    try {
      await t.mutation(internal.testing.createMagicLinkTokenForLatestRecruitment, {
        staffEmail: missingEmail,
        purpose: "submit",
      });
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toContain("staff-not-found");
    expect(String(caught)).not.toContain(missingEmail);
  });

  it("recipient safety probeは個人情報を返さず抑止状態だけを返す", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(internal.testing.getE2ERecipientSafetyState, {
      email: "recipient@example.com",
    });

    expect(result).toEqual({ notificationDeliverySuppressed: true });
  });
});
