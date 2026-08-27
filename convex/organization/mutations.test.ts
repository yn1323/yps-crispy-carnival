import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { addDays, todayJST } from "../_lib/dateFormat";
import {
  seedLegacyShopMembership,
  seedOrganizationManagerShop,
  seedOrganizationPersonLineLink,
  seedStaffLineAccount,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { requireOrganizationBusinessWrite } from "../organizationBilling/service";
import {
  applyAccountDeletionOrganizationDeparture,
  beginAccountDeletionOrganizationDeletion,
  prepareAccountDeletionOrganizationDeparture,
} from "./mutations";

const NOW = new Date("2026-07-16T00:00:00.000Z").getTime();

type OrganizationSeed = Awaited<ReturnType<typeof seedOrganizationManagerShop>>;

async function seedOrganizationShop(ctx: MutationCtx, organizationId: Id<"organizations">, name: string) {
  return await ctx.db.insert("shops", {
    organizationId,
    operatingStatus: "active",
    name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
}

async function seedTargetPerson(
  ctx: MutationCtx,
  args: {
    base: OrganizationSeed;
    subject: string;
    shopIds: readonly Id<"shops">[];
    manager?: boolean;
  },
) {
  const email = `${args.subject}@example.com`;
  const userId = await seedUser(ctx, args.subject, email);
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId: args.base.organizationId,
    userId,
    name: "削除対象",
    email,
    emailNormalized: email,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const memberId = args.manager
    ? await ctx.db.insert("organizationMembers", {
        organizationId: args.base.organizationId,
        personId,
        userId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      })
    : null;
  const staffIds: Id<"staffs">[] = [];
  for (const shopId of args.shopIds) {
    staffIds.push(
      await ctx.db.insert("staffs", {
        shopId,
        organizationId: args.base.organizationId,
        organizationPersonId: personId,
        userId,
        name: "削除対象",
        email,
        emailNormalized: email,
        isDeleted: false,
      }),
    );
    if (args.manager) await seedLegacyShopMembership(ctx, { shopId, userId });
  }
  return { email, memberId, personId, staffIds, userId };
}

async function seedAssignment(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; staffId: Id<"staffs">; date: string; recruitmentDeleted?: boolean },
) {
  const positionId = await ctx.db.insert("positions", {
    shopId: args.shopId,
    name: "通常",
    color: "#000000",
    sortOrder: 0,
    isDeleted: false,
  });
  const recruitmentId = await ctx.db.insert("recruitments", {
    shopId: args.shopId,
    periodStart: args.date,
    periodEnd: args.date,
    deadline: addDays(args.date, -1),
    shopClosedDates: [],
    status: "confirmed",
    confirmedAt: NOW,
    isDeleted: args.recruitmentDeleted ?? false,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
  const assignmentId = await ctx.db.insert("shiftAssignments", {
    recruitmentId,
    staffId: args.staffId,
    date: args.date,
    startTime: "10:00",
    endTime: "18:00",
    positionId,
  });
  return { assignmentId, recruitmentId };
}

async function seedStaffAccess(ctx: MutationCtx, args: { shopId: Id<"shops">; staffId: Id<"staffs"> }) {
  const { recruitmentId } = await seedAssignment(ctx, {
    shopId: args.shopId,
    staffId: args.staffId,
    date: addDays(todayJST(), -1),
  });
  const sessionId = await ctx.db.insert("sessions", {
    sessionToken: `session-${args.staffId}`,
    staffId: args.staffId,
    shopId: args.shopId,
    recruitmentId,
    expiresAt: NOW + 86_400_000,
  });
  const magicLinkId = await ctx.db.insert("magicLinks", {
    token: `magic-${args.staffId}`,
    staffId: args.staffId,
    shopId: args.shopId,
    recruitmentId,
    expiresAt: NOW + 86_400_000,
  });
  const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
    token: `line-${args.staffId}`,
    staffId: args.staffId,
    shopId: args.shopId,
    expiresAt: NOW + 86_400_000,
  });
  const lineAccountId = await seedStaffLineAccount(ctx, {
    staffId: args.staffId,
    shopId: args.shopId,
    lineUserId: `line-user-${args.staffId}`,
  });
  return { lineAccountId, lineLinkTokenId, magicLinkId, recruitmentId, sessionId };
}

async function seedOutbox(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    shopId?: Id<"shops">;
    staffId?: Id<"staffs">;
    userId?: Id<"users">;
    purpose?: "business" | "billing";
    status?: "pending" | "processing";
    dedupeKey: string;
  },
) {
  return await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: args.status ?? "pending",
    dedupeKey: args.dedupeKey,
    organizationId: args.organizationId,
    shopId: args.shopId,
    staffId: args.staffId,
    userId: args.userId,
    purpose: args.purpose ?? "business",
    payload: {
      kind: "email",
      from: "noreply@example.com",
      to: "recipient@example.com",
      subject: "件名",
      html: "本文",
      context: "organization-removal-test",
    },
    attemptCount: 0,
    nextRunAt: NOW,
    processingStartedAt: args.status === "processing" ? NOW : undefined,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

type RejectedShopRemovalCase = "unauthenticated" | "foreignShop" | "mismatchedStaff" | "deletedStaff";

async function seedRejectedShopRemovalCase(t: TestConvex<typeof schema>, scenario: RejectedShopRemovalCase) {
  return await t.run(async (ctx) => {
    const actorSubject = `rejected_shop_removal_${scenario}_actor`;
    const actorBase = await seedOrganizationManagerShop(ctx, { subject: actorSubject, plan: "pro" });
    let targetBase = actorBase;
    let operationShopId = actorBase.shopId;
    let targetShopId = actorBase.shopId;

    if (scenario === "foreignShop") {
      targetBase = await seedOrganizationManagerShop(ctx, {
        subject: `rejected_shop_removal_${scenario}_foreign_manager`,
        plan: "pro",
      });
      operationShopId = targetBase.shopId;
      targetShopId = targetBase.shopId;
    } else if (scenario === "mismatchedStaff") {
      targetShopId = await seedOrganizationShop(ctx, actorBase.organizationId, "対象外店舗");
    }

    const target = await seedTargetPerson(ctx, {
      base: targetBase,
      subject: `rejected_shop_removal_${scenario}_target`,
      shopIds: [targetShopId],
    });
    const { assignmentId } = await seedAssignment(ctx, {
      shopId: targetShopId,
      staffId: target.staffIds[0],
      date: addDays(todayJST(), 1),
    });
    const outboxId = await seedOutbox(ctx, {
      organizationId: targetBase.organizationId,
      shopId: targetShopId,
      staffId: target.staffIds[0],
      dedupeKey: `rejected-shop-removal-${scenario}`,
    });
    if (scenario === "deletedStaff") {
      await ctx.db.patch(target.staffIds[0], { isDeleted: true });
    }

    return {
      actorSubject,
      assignmentId,
      operationShopId,
      outboxId,
      personId: target.personId,
      staffId: target.staffIds[0],
    };
  });
}

async function readRejectedShopRemovalState(
  t: TestConvex<typeof schema>,
  ids: Awaited<ReturnType<typeof seedRejectedShopRemovalCase>>,
) {
  return await t.run(async (ctx) => ({
    assignment: await ctx.db.get(ids.assignmentId),
    auditEvents: await ctx.db.query("organizationAuditEvents").collect(),
    outbox: await ctx.db.get(ids.outboxId),
    person: await ctx.db.get(ids.personId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    staff: await ctx.db.get(ids.staffId),
  }));
}

async function readManagerRemovalProtectedState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    organizations: await ctx.db.query("organizations").collect(),
    shops: await ctx.db.query("shops").collect(),
    people: await ctx.db.query("organizationPeople").collect(),
    members: await ctx.db.query("organizationMembers").collect(),
    staffs: await ctx.db.query("staffs").collect(),
    assignments: await ctx.db.query("shiftAssignments").collect(),
    invitations: await ctx.db.query("organizationInvitations").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    analyticsEvents: await ctx.db.query("analyticsSourceEvents").collect(),
    rateLimits: await ctx.db.query("rateLimits").collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    billing: await ctx.db.query("organizationBillingStates").collect(),
    sessions: await ctx.db.query("sessions").collect(),
    magicLinks: await ctx.db.query("magicLinks").collect(),
    lineLinkTokens: await ctx.db.query("lineLinkTokens").collect(),
    lineAccounts: await ctx.db.query("staffLineAccounts").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

const managerRoleRemovalAccessCases = [
  { actorCase: "unauthenticated", actorLabel: "未認証" },
  { actorCase: "removed", actorLabel: "削除済み管理者" },
  { actorCase: "crossTenant", actorLabel: "別事業者の人物" },
] as const;

describe("organization shop staff order lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("店舗のアーカイブ中はprojectionを参照せず、再稼働時に組織共通順から再構築する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "shop_order_lifecycle_manager", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "shop_order_lifecycle_staff",
        shopIds: [base.shopId],
      });
      await ctx.db.insert("organizationStaffOrderStates", {
        organizationId: base.organizationId,
        revision: 1,
        activatedAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStaffOrderEntries", {
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        displayOrder: 0,
      });
      await ctx.db.insert("organizationStaffOrderEntries", {
        organizationId: base.organizationId,
        organizationPersonId: target.personId,
        displayOrder: 1,
      });
      await ctx.db.insert("shopStaffOrderEntries", {
        organizationId: base.organizationId,
        shopId: base.shopId,
        staffId: target.staffIds[0],
        organizationPersonId: target.personId,
        displayOrder: 1,
      });
      return { ...base, staffId: target.staffIds[0], targetPersonId: target.personId };
    });

    const actor = t.withIdentity({ subject: "shop_order_lifecycle_manager" });
    await expect(
      actor.mutation(api.organization.mutations.archiveShop, {
        shopId: ids.shopId,
        requestId: "archive-staff-order-shop",
      }),
    ).resolves.toMatchObject({ shopId: ids.shopId, shopStatus: "archived", changed: true });

    const archived = await t.run(async (ctx) => ({
      state: (
        await ctx.db
          .query("organizationStaffOrderStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique()
      )?.revision,
      entries: await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", ids.shopId))
        .collect(),
    }));
    expect(archived.state).toBe(2);
    expect(archived.entries).toHaveLength(1);

    await expect(
      actor.mutation(api.organization.mutations.reactivateShop, {
        shopId: ids.shopId,
        requestId: "reactivate-staff-order-shop",
      }),
    ).resolves.toMatchObject({ shopId: ids.shopId, shopStatus: "active", changed: true });

    const reactivated = await t.run(async (ctx) => ({
      state: (
        await ctx.db
          .query("organizationStaffOrderStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique()
      )?.revision,
      entries: await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", ids.shopId))
        .collect(),
    }));
    expect(reactivated.state).toBe(3);
    expect(reactivated.entries).toEqual([
      expect.objectContaining({
        organizationId: ids.organizationId,
        shopId: ids.shopId,
        staffId: ids.staffId,
        organizationPersonId: ids.targetPersonId,
        displayOrder: 1,
      }),
    ]);
  });
});

describe("organization person removal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("active管理者を店舗から外し、管理者権限と他店舗所属を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "shop_remove_actor", plan: "pro" });
      const otherShopId = await seedOrganizationShop(ctx, base.organizationId, "別店舗");
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "shop_remove_target",
        shopIds: [base.shopId, otherShopId],
        manager: true,
      });
      const access = await seedStaffAccess(ctx, { shopId: base.shopId, staffId: target.staffIds[0] });
      const staffOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        staffId: target.staffIds[0],
        dedupeKey: "shop-remove-staff",
      });
      const managerOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        userId: target.userId,
        dedupeKey: "shop-remove-manager",
      });
      return { ...base, ...target, ...access, managerOutboxId, otherShopId, staffOutboxId };
    });

    await expect(
      t.withIdentity({ subject: "shop_remove_actor" }).mutation(api.organization.mutations.removePersonFromShop, {
        shopId: ids.shopId,
        staffId: ids.staffIds[0],
        requestId: "shop-remove-request",
      }),
    ).resolves.toEqual({ changed: true });

    const state = await t.run(async (ctx) => ({
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .filter((q) => q.eq(q.field("targetId"), ids.personId))
        .first(),
      lineAccount: await ctx.db.get(ids.lineAccountId),
      lineLinkToken: await ctx.db.get(ids.lineLinkTokenId),
      magicLink: await ctx.db.get(ids.magicLinkId),
      managerOutbox: await ctx.db.get(ids.managerOutboxId),
      member: await ctx.db.get(ids.memberId as Id<"organizationMembers">),
      otherStaff: await ctx.db.get(ids.staffIds[1]),
      person: await ctx.db.get(ids.personId),
      session: await ctx.db.get(ids.sessionId),
      staff: await ctx.db.get(ids.staffIds[0]),
      staffOutbox: await ctx.db.get(ids.staffOutboxId),
    }));
    expect(state.staff?.isDeleted).toBe(true);
    expect(state.otherStaff?.isDeleted).toBe(false);
    expect(state.member?.status).toBe("active");
    expect(state.person?.status).toBe("active");
    expect(state.session?.revokedAt).toBe(NOW);
    expect(state.magicLink?.revokedAt).toBe(NOW);
    expect(state.lineLinkToken?.revokedAt).toBe(NOW);
    expect(state.lineAccount).toMatchObject({ isDeleted: true, following: false });
    expect(state.staffOutbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.managerOutbox?.status).toBe("pending");
    expect(state.audit).toMatchObject({
      action: "organization.person_removed_from_shop",
      fromState: `active:${ids.shopId}`,
      toState: `removed:${ids.shopId}`,
    });
  });

  it.each(["archived"] as const)("%s店舗では未完了の店舗所属解除を拒否する", async (operatingStatus) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: `inactive_shop_remove_${operatingStatus}`,
        plan: "pro",
      });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: `inactive_shop_target_${operatingStatus}`,
        shopIds: [base.shopId],
      });
      await ctx.db.patch(base.shopId, { operatingStatus });
      return { ...base, ...target };
    });

    await expect(
      t
        .withIdentity({ subject: `inactive_shop_remove_${operatingStatus}` })
        .mutation(api.organization.mutations.removePersonFromShop, {
          shopId: ids.shopId,
          staffId: ids.staffIds[0],
          requestId: `inactive-shop-remove-${operatingStatus}`,
        }),
    ).rejects.toThrow("稼働中の店舗だけ所属を変更できます");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.staffIds[0]))?.isDeleted)).resolves.toBe(false);
  });

  it.each([
    ["未認証", "unauthenticated", "Unauthenticated"],
    ["権限のない店舗", "foreignShop", "Not found"],
    ["店舗とスタッフの不一致", "mismatchedStaff", "Not found"],
    ["削除済みスタッフ", "deletedStaff", "Not found"],
  ] as const)("%sでは店舗所属を削除せず、副作用も起こさない", async (_label, scenario, expectedError) => {
    const t = convexTest(schema, modules);
    const ids = await seedRejectedShopRemovalCase(t, scenario);
    const before = await readRejectedShopRemovalState(t, ids);
    const request = {
      shopId: ids.operationShopId,
      staffId: ids.staffId,
      requestId: `rejected-shop-removal-${scenario}`,
    };

    const mutation =
      scenario === "unauthenticated"
        ? t.mutation(api.organization.mutations.removePersonFromShop, request)
        : t
            .withIdentity({ subject: ids.actorSubject })
            .mutation(api.organization.mutations.removePersonFromShop, request);
    await expect(mutation).rejects.toThrow(expectedError);

    expect(await readRejectedShopRemovalState(t, ids)).toEqual(before);
  });

  it("active管理者の事業者人物削除を副作用なしで拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "org_remove_actor", plan: "pro" });
      const otherShopId = await seedOrganizationShop(ctx, base.organizationId, "別店舗");
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "org_remove_target",
        shopIds: [base.shopId, otherShopId],
        manager: true,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, { freeManagerPersonId: target.personId });
      const access = await seedStaffAccess(ctx, { shopId: base.shopId, staffId: target.staffIds[0] });
      const otherOrganization = await seedOrganizationManagerShop(ctx, {
        subject: "org_remove_other_actor",
        plan: "pro",
      });
      const otherOrganizationMembershipId = await seedLegacyShopMembership(ctx, {
        shopId: otherOrganization.shopId,
        userId: target.userId,
      });
      const otherOrganizationOutboxId = await seedOutbox(ctx, {
        organizationId: otherOrganization.organizationId,
        userId: target.userId,
        dedupeKey: "org-remove-other-organization",
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "invitee@example.com",
        emailNormalized: "invitee@example.com",
        tokenDigest: "issued-invitation-digest",
        status: "pending",
        inviterMemberId: target.memberId as Id<"organizationMembers">,
        reservedSeat: true,
        version: 1,
        expiresAt: NOW + 86_400_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const targetedInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "before-profile-change@example.com",
        emailNormalized: "before-profile-change@example.com",
        invitedName: "削除対象",
        tokenDigest: "targeted-issued-invitation-digest",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        targetPersonId: target.personId,
        reservedSeat: true,
        version: 1,
        expiresAt: NOW + 86_400_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const invitationOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "removed-inviter-email",
        organizationId: base.organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "noreply@example.com",
          to: "invitee@example.com",
          context: "organization-manager-invitation",
        },
        attemptCount: 0,
        nextRunAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const staffOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        staffId: target.staffIds[0],
        dedupeKey: "org-remove-staff",
      });
      const userOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        userId: target.userId,
        status: "processing",
        dedupeKey: "org-remove-user",
      });
      const billingOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        userId: target.userId,
        purpose: "billing",
        dedupeKey: "org-remove-billing",
      });
      const unrelatedOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        userId: base.userId,
        dedupeKey: "org-remove-unrelated",
      });
      return {
        ...base,
        ...target,
        ...access,
        billingOutboxId,
        invitationId,
        invitationOutboxId,
        otherOrganizationMembershipId,
        otherOrganizationOutboxId,
        otherShopId,
        staffOutboxId,
        targetedInvitationId,
        unrelatedOutboxId,
        userOutboxId,
      };
    });

    const before = await readManagerRemovalProtectedState(t);
    await expect(
      t
        .withIdentity({ subject: "org_remove_actor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "organization-remove-request",
        }),
    ).rejects.toThrow("先に管理者権限を外してください。");
    expect(await readManagerRemovalProtectedState(t)).toEqual(before);
  });

  it("別の有効管理者がいても管理者本人の人物削除を副作用なしで拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "self_remove_actor", plan: "pro" });
      const successor = await seedTargetPerson(ctx, {
        base,
        subject: "self_remove_successor",
        shopIds: [],
        manager: true,
      });
      await ctx.db.patch(base.organizationId, {
        billingEmail: successor.email,
        billingEmailNormalized: successor.email,
      });
      return { ...base, successorMemberId: successor.memberId, successorPersonId: successor.personId };
    });

    const call = () =>
      t
        .withIdentity({ subject: "self_remove_actor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "self-remove-request",
        });
    const before = await readManagerRemovalProtectedState(t);
    await expect(call()).rejects.toThrow("先に管理者権限を外してください。");
    expect(await readManagerRemovalProtectedState(t)).toEqual(before);
  });

  it.each(["shop", "organization"] as const)("%s削除はpreview確認後に今日以降の割当も削除する", async (scope) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: `future_${scope}_actor`, plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: `future_${scope}_target`,
        shopIds: [base.shopId],
      });
      const { assignmentId } = await seedAssignment(ctx, {
        shopId: base.shopId,
        staffId: target.staffIds[0],
        date: addDays(todayJST(), 1),
      });
      return { ...base, ...target, assignmentId };
    });

    const actor = t.withIdentity({ subject: `future_${scope}_actor` });
    const detail = await actor.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.shopId,
      personId: ids.personId,
      now: NOW,
    });
    const preview = scope === "shop" ? detail?.memberships[0]?.removalPreview : detail?.removalPreview;
    if (preview?.kind !== "ready") throw new Error("removal preview not ready");

    const request =
      scope === "shop"
        ? actor.mutation(api.organization.mutations.removePersonFromShop, {
            shopId: ids.shopId,
            staffId: ids.staffIds[0],
            requestId: `future-${scope}`,
            removalPreview: {
              assignmentCount: preview.assignmentCount,
              fingerprint: preview.fingerprint,
            },
          })
        : actor.mutation(api.organization.mutations.removePersonFromOrganization, {
            shopId: ids.shopId,
            personId: ids.personId,
            requestId: `future-${scope}`,
            removalPreview: {
              assignmentCount: preview.assignmentCount,
              fingerprint: preview.fingerprint,
            },
          });
    await expect(request).resolves.toEqual({ changed: true });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.assignmentId))).resolves.toBeNull();
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe(
      scope === "shop" ? "active" : "removed",
    );
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.staffIds[0]))?.isDeleted)).resolves.toBe(true);
  });

  it("stale previewでは無変更にし、再確認後は対象の今日以降だけを削除して再送を冪等にする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "stale_preview_actor", plan: "pro" });
      const secondShopId = await seedOrganizationShop(ctx, base.organizationId, "第二店舗");
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "stale_preview_target",
        shopIds: [base.shopId, secondShopId],
      });
      const other = await seedTargetPerson(ctx, {
        base,
        subject: "stale_preview_other",
        shopIds: [base.shopId],
      });
      const otherOrganization = await seedOrganizationManagerShop(ctx, {
        subject: "stale_preview_other_org",
        plan: "pro",
      });
      const otherOrganizationTarget = await seedTargetPerson(ctx, {
        base: otherOrganization,
        subject: "stale_preview_other_org_target",
        shopIds: [otherOrganization.shopId],
      });
      const past = await seedAssignment(ctx, {
        shopId: base.shopId,
        staffId: target.staffIds[0],
        date: addDays(todayJST(), -1),
      });
      const today = await seedAssignment(ctx, {
        shopId: base.shopId,
        staffId: target.staffIds[0],
        date: todayJST(),
      });
      const future = await seedAssignment(ctx, {
        shopId: secondShopId,
        staffId: target.staffIds[1],
        date: addDays(todayJST(), 1),
      });
      const otherPerson = await seedAssignment(ctx, {
        shopId: base.shopId,
        staffId: other.staffIds[0],
        date: todayJST(),
      });
      const otherOrg = await seedAssignment(ctx, {
        shopId: otherOrganization.shopId,
        staffId: otherOrganizationTarget.staffIds[0],
        date: todayJST(),
      });
      return { ...base, ...target, past, today, future, otherPerson, otherOrg };
    });
    const actor = t.withIdentity({ subject: "stale_preview_actor" });
    const getPreview = async () => {
      const detail = await actor.query(api.organization.userDetailQueries.getUserDetail, {
        shopId: ids.shopId,
        personId: ids.personId,
        now: NOW,
      });
      if (detail?.removalPreview.kind !== "ready") throw new Error("removal preview not ready");
      return detail.removalPreview;
    };
    const stalePreview = await getPreview();
    expect(stalePreview.assignmentCount).toBe(2);

    const addedAfterPreview = await t.run(async (ctx) =>
      seedAssignment(ctx, {
        shopId: ids.shopId,
        staffId: ids.staffIds[0],
        date: addDays(todayJST(), 2),
      }),
    );
    const requestId = "stale-preview-removal";
    await expect(
      actor.mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId,
        removalPreview: {
          assignmentCount: stalePreview.assignmentCount,
          fingerprint: stalePreview.fingerprint,
        },
      }),
    ).rejects.toThrow("今日以降のシフトの割り当てが変更されました");

    const unchanged = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.personId),
      staffs: await Promise.all(ids.staffIds.map((staffId) => ctx.db.get(staffId))),
      targetAssignments: await Promise.all(
        [ids.today.assignmentId, ids.future.assignmentId, addedAfterPreview.assignmentId].map((id) => ctx.db.get(id)),
      ),
    }));
    expect(unchanged.person?.status).toBe("active");
    expect(unchanged.staffs.every((staff) => staff?.isDeleted === false)).toBe(true);
    expect(unchanged.targetAssignments.every((assignment) => assignment !== null)).toBe(true);

    const confirmedPreview = await getPreview();
    expect(confirmedPreview.assignmentCount).toBe(3);
    const mutationArgs = {
      shopId: ids.shopId,
      personId: ids.personId,
      requestId,
      removalPreview: {
        assignmentCount: confirmedPreview.assignmentCount,
        fingerprint: confirmedPreview.fingerprint,
      },
    };
    await expect(
      actor.mutation(api.organization.mutations.removePersonFromOrganization, mutationArgs),
    ).resolves.toEqual({ changed: true });
    await expect(
      actor.mutation(api.organization.mutations.removePersonFromOrganization, mutationArgs),
    ).resolves.toEqual({ changed: false });

    const finalState = await t.run(async (ctx) => ({
      past: await ctx.db.get(ids.past.assignmentId),
      today: await ctx.db.get(ids.today.assignmentId),
      future: await ctx.db.get(ids.future.assignmentId),
      addedAfterPreview: await ctx.db.get(addedAfterPreview.assignmentId),
      otherPerson: await ctx.db.get(ids.otherPerson.assignmentId),
      otherOrg: await ctx.db.get(ids.otherOrg.assignmentId),
      recruitments: await Promise.all(
        [
          ids.past.recruitmentId,
          ids.today.recruitmentId,
          ids.future.recruitmentId,
          addedAfterPreview.recruitmentId,
        ].map((id) => ctx.db.get(id)),
      ),
    }));
    expect(finalState.past).not.toBeNull();
    expect(finalState.today).toBeNull();
    expect(finalState.future).toBeNull();
    expect(finalState.addedAfterPreview).toBeNull();
    expect(finalState.otherPerson).not.toBeNull();
    expect(finalState.otherOrg).not.toBeNull();
    expect(finalState.recruitments.every((recruitment) => recruitment?.status === "confirmed")).toBe(true);
  });

  it("請求先メールアドレスと一致する人物も通常の権限条件で削除できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "billing_owner_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "billing_owner_target",
        shopIds: [],
        manager: false,
      });
      await ctx.db.patch(base.organizationId, {
        billingEmail: target.email,
        billingEmailNormalized: target.email,
      });
      return { ...base, ...target };
    });

    await expect(
      t
        .withIdentity({ subject: "billing_owner_actor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "billing-owner",
        }),
    ).resolves.toEqual({ changed: true });
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("removed");
  });

  it("最後の有効管理者は自分自身でも事業者から削除できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "last_manager", plan: "pro" });
      await ctx.db.patch(base.organizationId, {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
      });
      const invalidUserId = await seedUser(ctx, "invalid_manager");
      const invalidPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: invalidUserId,
        name: "削除済み管理者",
        email: "invalid_manager@example.com",
        emailNormalized: "invalid_manager@example.com",
        status: "removed",
        createdAt: NOW,
        updatedAt: NOW,
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

    await expect(
      t.withIdentity({ subject: "last_manager" }).mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "last-manager",
      }),
    ).rejects.toThrow("先に管理者権限を外してください。");
  });

  it("所属が重複してアクセス不能な管理者を有効な後任として数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "last_manager_duplicate_successor", plan: "pro" });
      await ctx.db.patch(base.organizationId, {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
      });
      const successor = await seedTargetPerson(ctx, {
        base,
        subject: "duplicate_successor",
        shopIds: [],
        manager: true,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: successor.personId,
        userId: successor.userId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return base;
    });

    await expect(
      t
        .withIdentity({ subject: "last_manager_duplicate_successor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "last-manager-duplicate-successor",
        }),
    ).rejects.toThrow("先に管理者権限を外してください。");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("active");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.memberId))?.status)).resolves.toBe("active");
  });

  it("同じuserが別personで重複所属するアクセス不能な管理者も有効な後任として数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "last_manager_duplicate_user", plan: "pro" });
      await ctx.db.patch(base.organizationId, {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
      });
      const successor = await seedTargetPerson(ctx, {
        base,
        subject: "duplicate_user_successor",
        shopIds: [],
        manager: true,
      });
      const duplicatePersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: successor.userId,
        name: "重複後任管理者",
        email: "duplicate-user-successor-alt@example.com",
        emailNormalized: "duplicate-user-successor-alt@example.com",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: duplicatePersonId,
        userId: successor.userId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return base;
    });

    await expect(
      t
        .withIdentity({ subject: "last_manager_duplicate_user" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "last-manager-duplicate-user",
        }),
    ).rejects.toThrow("先に管理者権限を外してください。");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("active");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.memberId))?.status)).resolves.toBe("active");
  });

  it("スタッフ兼管理者の管理権限だけを外し、スタッフ所属とリンクを保持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_remove_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_remove_target",
        shopIds: [base.shopId],
        manager: true,
      });
      const access = await seedStaffAccess(ctx, { shopId: base.shopId, staffId: target.staffIds[0] });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState || !target.memberId) throw new Error("organization seed is incomplete");
      await ctx.db.patch(billingState._id, { freeManagerPersonId: target.personId });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "role-invitee@example.com",
        emailNormalized: "role-invitee@example.com",
        tokenDigest: "role-removal-invitation",
        status: "pending",
        inviterMemberId: target.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: NOW + 86_400_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const invitationOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "role-remove-invitation",
        organizationId: base.organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "noreply@example.com",
          to: "role-invitee@example.com",
          context: "organization-manager-invitation",
        },
        attemptCount: 0,
        nextRunAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const managerBusinessOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        userId: target.userId,
        dedupeKey: "role-remove-manager-business",
      });
      const managerBillingOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        userId: target.userId,
        purpose: "billing",
        dedupeKey: "role-remove-manager-billing",
      });
      const staffOutboxId = await seedOutbox(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        staffId: target.staffIds[0],
        dedupeKey: "role-remove-staff-business",
      });
      return {
        ...base,
        ...target,
        ...access,
        billingStateId: billingState._id,
        invitationId,
        invitationOutboxId,
        managerBillingOutboxId,
        managerBusinessOutboxId,
        staffOutboxId,
      };
    });

    const call = () =>
      t.withIdentity({ subject: "role_remove_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-remove-request",
      });
    await expect(call()).resolves.toEqual({ changed: true });
    await expect(call()).resolves.toEqual({ changed: false });

    const requestKey = await toAuditRequestKey("role-remove-request");
    const state = await t.run(async (ctx) => ({
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:person-removal:managerRole:${requestKey}`),
        )
        .first(),
      billingState: await ctx.db.get(ids.billingStateId),
      invitation: await ctx.db.get(ids.invitationId),
      invitationOutbox: await ctx.db.get(ids.invitationOutboxId),
      legacyMembership: await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", ids.userId).eq("shopId", ids.shopId))
        .first(),
      lineAccount: await ctx.db.get(ids.lineAccountId),
      managerBillingOutbox: await ctx.db.get(ids.managerBillingOutboxId),
      managerBusinessOutbox: await ctx.db.get(ids.managerBusinessOutboxId),
      member: await ctx.db.get(ids.memberId as Id<"organizationMembers">),
      person: await ctx.db.get(ids.personId),
      session: await ctx.db.get(ids.sessionId),
      staff: await ctx.db.get(ids.staffIds[0]),
      staffOutbox: await ctx.db.get(ids.staffOutboxId),
    }));
    expect(state.member?.status).toBe("removed");
    expect(state.person?.status).toBe("active");
    expect(state.staff?.isDeleted).toBe(false);
    expect(state.session?.revokedAt).toBeUndefined();
    expect(state.lineAccount).toMatchObject({ isDeleted: false, following: true });
    expect(state.legacyMembership?.isDeleted).toBe(true);
    expect(state.invitation).toMatchObject({ status: "revoked", reservedSeat: false, version: 2 });
    expect(state.invitationOutbox).toMatchObject({ status: "cancelled", cancelReason: "invitation_inactive" });
    expect(state.managerBusinessOutbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.managerBillingOutbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.staffOutbox?.status).toBe("pending");
    expect(state.billingState?.freeManagerPersonId).toBeUndefined();
    expect(state.billingState?.version).toBe(2);
    expect(state.audit).toMatchObject({ action: "organization.manager_role_removed", toState: "staffOnly" });
  });

  it.each(managerRoleRemovalAccessCases)(
    "removeManagerRoleは$actorLabelからの直呼びを副作用なしで拒否する",
    async ({ actorCase }) => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const actor = await seedOrganizationManagerShop(ctx, {
          subject: `role_access_${actorCase}_actor`,
          plan: "pro",
        });
        const actorTarget = await seedTargetPerson(ctx, {
          base: actor,
          subject: `role_access_${actorCase}_target`,
          shopIds: [actor.shopId],
          manager: true,
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: `role_access_${actorCase}_foreign`,
          plan: "pro",
        });
        const foreignTarget = await seedTargetPerson(ctx, {
          base: foreign,
          subject: `role_access_${actorCase}_foreign_target`,
          shopIds: [foreign.shopId],
          manager: true,
        });
        if (actorCase === "removed") {
          await ctx.db.patch(actor.memberId, { status: "removed", updatedAt: NOW });
        }
        return { actor, actorTarget, foreignTarget };
      });
      const before = await readManagerRemovalProtectedState(t);
      const caller =
        actorCase === "unauthenticated" ? t : t.withIdentity({ subject: `role_access_${actorCase}_actor` });

      await expect(
        caller.mutation(api.organization.mutations.removeManagerRole, {
          shopId: ids.actor.shopId,
          personId: actorCase === "crossTenant" ? ids.foreignTarget.personId : ids.actorTarget.personId,
          requestId: `role-access-${actorCase}`,
        }),
      ).rejects.toThrow(actorCase === "unauthenticated" ? "Unauthenticated" : "Not found");
      expect(await readManagerRemovalProtectedState(t)).toEqual(before);
    },
  );

  it("スタッフ所属がない管理者の権限解除は人物を保持して管理アクセスだけを終了する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_remove_no_staff_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_remove_no_staff_target",
        shopIds: [],
        manager: true,
      });
      return { ...base, ...target };
    });

    await expect(
      t.withIdentity({ subject: "role_remove_no_staff_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-no-staff-request",
      }),
    ).resolves.toEqual({ changed: true });
    const state = await t.run(async (ctx) => ({
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .filter((q) => q.eq(q.field("targetId"), ids.personId))
        .first(),
      member: await ctx.db.get(ids.memberId as Id<"organizationMembers">),
      person: await ctx.db.get(ids.personId),
    }));
    expect(state.member?.status).toBe("removed");
    expect(state.person?.status).toBe("active");
    expect(state.audit).toMatchObject({ action: "organization.manager_role_removed", toState: "personOnly" });
  });

  it("管理者権限解除は同じrequestIdの別personを副作用なしで拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_intent_actor", plan: "pro" });
      const first = await seedTargetPerson(ctx, {
        base,
        subject: "role_intent_first",
        shopIds: [base.shopId],
        manager: true,
      });
      const second = await seedTargetPerson(ctx, {
        base,
        subject: "role_intent_second",
        shopIds: [base.shopId],
        manager: true,
      });
      return { ...base, first, second };
    });
    const actor = t.withIdentity({ subject: "role_intent_actor" });
    await expect(
      actor.mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.first.personId,
        requestId: "role-intent-shared",
      }),
    ).resolves.toEqual({ changed: true });
    const before = await readManagerRemovalProtectedState(t);
    await expect(
      actor.mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.second.personId,
        requestId: "role-intent-shared",
      }),
    ).rejects.toThrow("以前の管理者権限変更と対象が一致しません");
    expect(await readManagerRemovalProtectedState(t)).toEqual(before);
  });

  it("スタッフ所属がない請求先一致者も管理者権限を外せる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_billing_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_billing_target",
        shopIds: [],
        manager: true,
      });
      if (!target.memberId) throw new Error("member not found");
      await ctx.db.patch(base.organizationId, {
        billingEmail: target.email,
        billingEmailNormalized: target.email,
      });
      return { ...base, ...target, memberId: target.memberId };
    });
    await expect(
      t.withIdentity({ subject: "role_billing_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-billing-request",
      }),
    ).resolves.toEqual({ changed: true });
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.memberId))?.status)).resolves.toBe("removed");
  });

  it("スタッフ所属がなく将来シフトが残る管理者の権限解除は人物と割当を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_future_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_future_target",
        shopIds: [base.shopId],
        manager: true,
      });
      await ctx.db.patch(target.staffIds[0], { isDeleted: true });
      const { assignmentId } = await seedAssignment(ctx, {
        shopId: base.shopId,
        staffId: target.staffIds[0],
        date: addDays(todayJST(), 1),
      });
      return { ...base, ...target, assignmentId };
    });
    await expect(
      t.withIdentity({ subject: "role_future_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-future-request",
      }),
    ).resolves.toEqual({ changed: true });
    const state = await t.run(async (ctx) => ({
      assignment: await ctx.db.get(ids.assignmentId),
      member: await ctx.db.get(ids.memberId as Id<"organizationMembers">),
      person: await ctx.db.get(ids.personId),
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .filter((q) => q.eq(q.field("targetId"), ids.personId))
        .first(),
    }));
    expect(state.assignment).not.toBeNull();
    expect(state.member?.status).toBe("removed");
    expect(state.person?.status).toBe("active");
    expect(state.audit).toMatchObject({ action: "organization.manager_role_removed", toState: "personOnly" });
  });

  it("最後の有効管理者の管理権限は外せない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_last_manager", plan: "pro" });
      await ctx.db.patch(base.organizationId, {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
      });
      return base;
    });
    await expect(
      t.withIdentity({ subject: "role_last_manager" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-last-request",
      }),
    ).rejects.toThrow("最後の有効管理者の管理者権限は外せません");
  });

  it("Freeでも2人目の管理者権限を外して1人へ戻せる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_free_actor", plan: "free" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_free_target",
        shopIds: [base.shopId],
        manager: true,
      });
      return { ...base, ...target };
    });
    await expect(
      t.withIdentity({ subject: "role_free_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-free-request",
      }),
    ).resolves.toEqual({ changed: true });
    const state = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.memberId as Id<"organizationMembers">),
      person: await ctx.db.get(ids.personId),
      staff: await ctx.db.get(ids.staffIds[0]),
    }));
    expect(state.member?.status).toBe("removed");
    expect(state.person?.status).toBe("active");
    expect(state.staff?.isDeleted).toBe(false);
  });

  it("Free上限超過は縮小操作ごとに自動解除され、課金stateを変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "free_limit_recovery_actor",
        plan: "free",
      });
      const excessShopId = await seedOrganizationShop(ctx, base.organizationId, "上限超過店舗");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      return {
        ...base,
        excessShopId,
        billingContract: { state: billingState.state, version: billingState.version },
      };
    });
    const actor = t.withIdentity({ subject: "free_limit_recovery_actor" });
    const readBillingContract = async () =>
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        return { state: billingState.state, version: billingState.version };
      });
    const requireBusinessWrite = async () =>
      await t.run(async (ctx) => await requireOrganizationBusinessWrite(ctx, ids.organizationId));

    await expect(requireBusinessWrite()).rejects.toMatchObject({
      data: {
        code: "USAGE_LIMIT_EXCEEDED",
        violations: [{ kind: "activeShops", current: 2, max: 1, excess: 1 }],
      },
    });
    await expect(
      actor.mutation(api.organization.mutations.archiveShop, {
        shopId: ids.excessShopId,
        requestId: "free-limit-recovery-archive",
      }),
    ).resolves.toEqual({ shopId: ids.excessShopId, shopStatus: "archived", changed: true });
    await expect(requireBusinessWrite()).resolves.toMatchObject({ entitlementPlan: "free" });
    await expect(readBillingContract()).resolves.toEqual(ids.billingContract);

    const people = await t.run(async (ctx) => {
      const seeded = [];
      for (let index = 1; index <= 5; index += 1) {
        seeded.push(
          await seedTargetPerson(ctx, {
            base: ids,
            subject: `free_limit_recovery_staff_${index}`,
            shopIds: [ids.shopId],
          }),
        );
      }
      return seeded;
    });
    await expect(requireBusinessWrite()).rejects.toMatchObject({
      data: {
        code: "USAGE_LIMIT_EXCEEDED",
        violations: [{ kind: "people", current: 6, max: 5, excess: 1 }],
      },
    });
    await expect(
      actor.mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.shopId,
        personId: people[0].personId,
        requestId: "free-limit-recovery-person",
      }),
    ).resolves.toEqual({ changed: true });
    await expect(requireBusinessWrite()).resolves.toMatchObject({ entitlementPlan: "free" });
    await expect(readBillingContract()).resolves.toEqual(ids.billingContract);

    await t.run(async (ctx) => {
      for (const person of people.slice(1, 3)) {
        await ctx.db.insert("organizationMembers", {
          organizationId: ids.organizationId,
          personId: person.personId,
          userId: person.userId,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
        });
      }
    });
    await expect(requireBusinessWrite()).rejects.toMatchObject({
      data: {
        code: "USAGE_LIMIT_EXCEEDED",
        violations: [{ kind: "activeManagers", current: 3, max: 2, excess: 1 }],
      },
    });
    await expect(
      actor.mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: people[1].personId,
        requestId: "free-limit-recovery-manager",
      }),
    ).resolves.toEqual({ changed: true });
    await expect(requireBusinessWrite()).resolves.toMatchObject({ entitlementPlan: "free" });
    await expect(readBillingContract()).resolves.toEqual(ids.billingContract);
  });

  it("2人の管理者が互いの権限を同時に外してもOCCで必ず1人を残す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_free_concurrent_actor", plan: "free" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_free_concurrent_target",
        shopIds: [base.shopId],
        manager: true,
      });
      return { ...base, target };
    });

    const results = await Promise.allSettled([
      t.withIdentity({ subject: "role_free_concurrent_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.target.personId,
        requestId: "role-free-concurrent-remove-target",
      }),
      t
        .withIdentity({ subject: "role_free_concurrent_target" })
        .mutation(api.organization.mutations.removeManagerRole, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "role-free-concurrent-remove-actor",
        }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status !== "rejected") throw new Error("concurrent manager removal rejection not found");
    expect(rejected.reason).toBeInstanceOf(Error);

    const activeMembers = await t.run(
      async (ctx) =>
        await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_status", (q) =>
            q.eq("organizationId", ids.organizationId).eq("status", "active"),
          )
          .collect(),
    );
    expect(activeMembers).toHaveLength(1);
  });

  it("別事業者のpersonIdは同じmanager APIから削除できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, { subject: "idor_actor", plan: "pro" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "idor_other", plan: "pro" });
      return { actorShopId: actor.shopId, otherPersonId: other.personId };
    });

    await expect(
      t.withIdentity({ subject: "idor_actor" }).mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.actorShopId,
        personId: ids.otherPersonId,
        requestId: "idor-request",
      }),
    ).rejects.toThrow("Not found");
  });
});

describe("organization person profile update", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("連携済み本人の連絡先をpersonと同一組織の有効staffだけへ反映する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "profile_self_actor",
        email: "profile-self-login@example.com",
        plan: "pro",
      });
      const activeStaffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "更新前の管理者",
        email: "profile-self-login@example.com",
        emailNormalized: "profile-self-login@example.com",
        isDeleted: false,
      });
      const deletedStaffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "削除済み管理者",
        email: "deleted-contact@example.com",
        emailNormalized: "deleted-contact@example.com",
        isDeleted: true,
      });

      const otherOrganizationId = await ctx.db.insert("organizations", {
        name: "別グループ",
        billingEmail: "other-billing@example.com",
        billingEmailNormalized: "other-billing@example.com",
        isDeleted: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const otherShopId = await seedOrganizationShop(ctx, otherOrganizationId, "別グループ店舗");
      const otherPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: otherOrganizationId,
        userId: base.userId,
        name: "別グループの管理者",
        email: "other-contact@example.com",
        emailNormalized: "other-contact@example.com",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const otherStaffId = await ctx.db.insert("staffs", {
        shopId: otherShopId,
        organizationId: otherOrganizationId,
        organizationPersonId: otherPersonId,
        userId: base.userId,
        name: "別グループの管理者",
        email: "other-contact@example.com",
        emailNormalized: "other-contact@example.com",
        isDeleted: false,
      });
      return { ...base, activeStaffId, deletedStaffId, otherOrganizationId, otherPersonId, otherStaffId };
    });
    const actor = t.withIdentity({ subject: "profile_self_actor" });

    const result = await actor.mutation(api.organization.mutations.updatePersonProfile, {
      shopId: ids.shopId,
      personId: ids.personId,
      name: "更新後の管理者",
      email: "profile-self-contact@example.com",
      requestId: "person-profile-self-contact",
    });

    expect(result).toEqual({ changed: true });
    const state = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.personId),
      activeStaff: await ctx.db.get(ids.activeStaffId),
      deletedStaff: await ctx.db.get(ids.deletedStaffId),
      user: await ctx.db.get(ids.userId),
      organization: await ctx.db.get(ids.organizationId),
      otherOrganization: await ctx.db.get(ids.otherOrganizationId),
      otherPerson: await ctx.db.get(ids.otherPersonId),
      otherStaff: await ctx.db.get(ids.otherStaffId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .filter((q) => q.eq(q.field("action"), "organization.person_profile_updated"))
        .collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.person).toMatchObject({
      name: "更新後の管理者",
      email: "profile-self-contact@example.com",
      emailNormalized: "profile-self-contact@example.com",
    });
    expect(state.activeStaff).toMatchObject({
      name: "更新後の管理者",
      email: "profile-self-contact@example.com",
      emailNormalized: "profile-self-contact@example.com",
    });
    expect(state.deletedStaff).toMatchObject({
      name: "削除済み管理者",
      email: "deleted-contact@example.com",
      emailNormalized: "deleted-contact@example.com",
    });
    expect(state.user).toMatchObject({
      name: "更新後の管理者",
      email: "profile-self-login@example.com",
      emailNormalized: "profile-self-login@example.com",
    });
    expect(state.organization).toMatchObject({
      billingEmail: "profile-self-login@example.com",
      billingEmailNormalized: "profile-self-login@example.com",
    });
    expect(state.otherOrganization).toMatchObject({
      billingEmail: "other-billing@example.com",
      billingEmailNormalized: "other-billing@example.com",
    });
    expect(state.otherPerson).toMatchObject({
      name: "別グループの管理者",
      email: "other-contact@example.com",
      emailNormalized: "other-contact@example.com",
    });
    expect(state.otherStaff).toMatchObject({
      name: "別グループの管理者",
      email: "other-contact@example.com",
      emailNormalized: "other-contact@example.com",
    });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      actorUserId: ids.userId,
      targetKind: "person",
      targetId: ids.personId,
    });
    expect(JSON.stringify(state.audits[0])).not.toContain("person-profile-self-contact");
    expect(JSON.stringify(state.audits[0])).not.toContain("profile-self-login@example.com");
    expect(JSON.stringify(state.audits[0])).not.toContain("profile-self-contact@example.com");
    expect(
      state.scheduled
        .filter((job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange")
        .map((job) => job.args[0]),
    ).toEqual([
      expect.objectContaining({
        staffId: ids.activeStaffId,
        expectedEmailNormalized: "profile-self-contact@example.com",
      }),
    ]);
  });

  it("別の連携済み人物の変更を全店舗の有効staffへ同期し、メール変更通知を店舗ごとに予約する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "profile_multi_shop_actor",
        plan: "pro",
      });
      const otherShopId = await seedOrganizationShop(ctx, base.organizationId, "別店舗");
      const targetUserId = await seedUser(ctx, "profile_multi_shop_target", "profile-before@example.com");
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: targetUserId,
        name: "同期前",
        email: "profile-before@example.com",
        emailNormalized: "profile-before@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffIds = await Promise.all(
        [base.shopId, otherShopId].map(
          async (shopId) =>
            await ctx.db.insert("staffs", {
              shopId,
              organizationId: base.organizationId,
              organizationPersonId: personId,
              userId: targetUserId,
              name: "同期前",
              email: "profile-before@example.com",
              emailNormalized: "profile-before@example.com",
              isDeleted: false,
            }),
        ),
      );
      return { ...base, personId, staffIds, targetUserId };
    });

    await t
      .withIdentity({ subject: "profile_multi_shop_actor" })
      .mutation(api.organization.mutations.updatePersonProfile, {
        shopId: ids.shopId,
        personId: ids.personId,
        name: "同期後",
        email: "profile-after@example.com",
        requestId: "person-profile-multi-shop",
      });

    const state = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.personId),
      staffs: await Promise.all(ids.staffIds.map(async (staffId) => await ctx.db.get(staffId))),
      targetUser: await ctx.db.get(ids.targetUserId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.person).toMatchObject({ name: "同期後", emailNormalized: "profile-after@example.com" });
    expect(state.staffs).toEqual([
      expect.objectContaining({ name: "同期後", emailNormalized: "profile-after@example.com" }),
      expect.objectContaining({ name: "同期後", emailNormalized: "profile-after@example.com" }),
    ]);
    expect(state.targetUser).toMatchObject({
      email: "profile-before@example.com",
      emailNormalized: "profile-before@example.com",
    });
    expect(
      state.scheduled.filter(
        (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
      ),
    ).toHaveLength(2);
  });

  it("同じメールのアカウント削除履歴が残っていても現役人物のプロフィールを更新する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "profile_with_terminal_history_actor",
        email: "profile-with-terminal-history@example.com",
        plan: "pro",
      });
      const oldUserId = await seedUser(
        ctx,
        "profile_with_terminal_history_old",
        "profile-with-terminal-history@example.com",
      );
      const now = Date.now();
      await ctx.db.patch(oldUserId, { isDeleted: true, accountDeletionRequestedAt: now });
      const oldPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: oldUserId,
        name: "削除済みの旧人物",
        email: "profile-with-terminal-history@example.com",
        emailNormalized: "profile-with-terminal-history@example.com",
        status: "removed",
        createdAt: now - 10_000,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: oldPersonId,
        userId: oldUserId,
        status: "removed",
        createdAt: now - 10_000,
        updatedAt: now,
      });
      return { ...base, oldPersonId, oldUserId };
    });

    await expect(
      t
        .withIdentity({ subject: "profile_with_terminal_history_actor" })
        .mutation(api.organization.mutations.updatePersonProfile, {
          shopId: ids.shopId,
          personId: ids.personId,
          name: "更新後の現役人物",
          email: "profile-with-terminal-history@example.com",
          requestId: "profile-with-terminal-history",
        }),
    ).resolves.toEqual({ changed: true });

    const state = await t.run(async (ctx) => ({
      activePerson: await ctx.db.get(ids.personId),
      oldPerson: await ctx.db.get(ids.oldPersonId),
      oldUser: await ctx.db.get(ids.oldUserId),
    }));
    expect(state.activePerson).toMatchObject({
      name: "更新後の現役人物",
      email: "profile-with-terminal-history@example.com",
      status: "active",
    });
    expect(state.oldPerson).toMatchObject({ _id: ids.oldPersonId, name: "削除済みの旧人物", status: "removed" });
    expect(state.oldUser).toMatchObject({ _id: ids.oldUserId, isDeleted: true });
  });

  it("組織内の別人物が使うメールアドレスへの変更を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "profile_duplicate_actor",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "変更対象",
        email: "profile-target@example.com",
        emailNormalized: "profile-target@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "別人物",
        email: "profile-used@example.com",
        emailNormalized: "profile-used@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, personId };
    });

    await expect(
      t.withIdentity({ subject: "profile_duplicate_actor" }).mutation(api.organization.mutations.updatePersonProfile, {
        shopId: ids.shopId,
        personId: ids.personId,
        name: "変更後",
        email: "profile-used@example.com",
        requestId: "person-profile-duplicate",
      }),
    ).rejects.toThrow("このメールアドレスは、組織内の別のユーザーが使用しています。");
  });

  it("未正規化の旧スタッフが使うメールアドレスへの変更を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "profile_legacy_duplicate_actor",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "変更対象",
        email: "profile-legacy-target@example.com",
        emailNormalized: "profile-legacy-target@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: personId,
        name: "変更対象",
        email: "profile-legacy-target@example.com",
        emailNormalized: "profile-legacy-target@example.com",
        isDeleted: false,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        name: "旧データ",
        email: "Legacy-Used@Example.com",
        isDeleted: false,
      });
      return { ...base, personId, staffId };
    });

    await expect(
      t
        .withIdentity({ subject: "profile_legacy_duplicate_actor" })
        .mutation(api.organization.mutations.updatePersonProfile, {
          shopId: ids.shopId,
          personId: ids.personId,
          name: "変更後",
          email: "legacy-used@example.com",
          requestId: "person-profile-legacy-duplicate",
        }),
    ).rejects.toThrow("このメールアドレスはすでに使用されています。");

    const state = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.personId),
      staff: await ctx.db.get(ids.staffId),
    }));
    expect(state.person).toMatchObject({
      name: "変更対象",
      email: "profile-legacy-target@example.com",
      emailNormalized: "profile-legacy-target@example.com",
    });
    expect(state.staff).toMatchObject({
      name: "変更対象",
      email: "profile-legacy-target@example.com",
      emailNormalized: "profile-legacy-target@example.com",
    });
  });

  it("別組織の人物IDとremoved管理者からの更新を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "profile_idor_actor",
        plan: "pro",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "profile_idor_other",
        plan: "pro",
      });
      return { actor, other };
    });
    const actor = t.withIdentity({ subject: "profile_idor_actor" });

    await expect(
      actor.mutation(api.organization.mutations.updatePersonProfile, {
        shopId: ids.actor.shopId,
        personId: ids.other.personId,
        name: "不正更新",
        email: "profile-hack@example.com",
        requestId: "person-profile-idor",
      }),
    ).rejects.toThrow("Not found");

    await t.run(async (ctx) => await ctx.db.patch(ids.actor.memberId, { status: "removed" }));
    await expect(
      actor.mutation(api.organization.mutations.updatePersonProfile, {
        shopId: ids.actor.shopId,
        personId: ids.actor.personId,
        name: "削除済み更新",
        email: "profile-removed@example.com",
        requestId: "person-profile-removed",
      }),
    ).rejects.toThrow("Not found");
  });
});

describe("account deletion organization operations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("別の有効管理者がいる組織では本人の管理者・人物・staff accessだけを終了する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "account_departure_actor",
        plan: "pro",
      });
      const successor = await seedTargetPerson(ctx, {
        base,
        subject: "account_departure_successor",
        shopIds: [],
        manager: true,
      });
      await ctx.db.patch(base.organizationId, {
        billingEmail: successor.email,
        billingEmailNormalized: successor.email,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "管理者兼スタッフ",
        email: "account_departure_actor@example.com",
        emailNormalized: "account_departure_actor@example.com",
        isDeleted: false,
      });
      const access = await seedStaffAccess(ctx, { shopId: base.shopId, staffId });
      const canonicalLine = await seedOrganizationPersonLineLink(ctx, {
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        lineUserId: "account-departure-canonical-line",
      });
      const future = await seedAssignment(ctx, {
        shopId: base.shopId,
        staffId,
        date: addDays(todayJST(), 1),
      });
      const [organization, person, member] = await Promise.all([
        ctx.db.get(base.organizationId),
        ctx.db.get(base.personId),
        ctx.db.get(base.memberId),
      ]);
      if (!organization || !person || !member) throw new Error("account departure actor not found");
      return {
        ...base,
        ...access,
        ...canonicalLine,
        actor: { organization, person, member },
        assignmentId: future.assignmentId,
        staffId,
        successorMemberId: successor.memberId,
      };
    });

    const result = await t.run(async (ctx) => {
      const plan = await prepareAccountDeletionOrganizationDeparture(ctx, {
        actor: ids.actor,
        accountUserId: ids.userId,
        asOfDate: todayJST(),
      });
      return await applyAccountDeletionOrganizationDeparture(ctx, {
        plan,
        correlationId: "account-departure-test",
        now: NOW,
      });
    });
    expect(result).toEqual({ assignmentCount: 1 });

    const state = await t.run(async (ctx) => ({
      assignment: await ctx.db.get(ids.assignmentId),
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", "account-departure-test"))
        .unique(),
      lineAccount: await ctx.db.get(ids.lineAccountId),
      canonicalLineLink: await ctx.db.get(ids.organizationPersonLineLinkId),
      canonicalProvider: await ctx.db.get(ids.lineProviderUserId),
      lineLinkToken: await ctx.db.get(ids.lineLinkTokenId),
      magicLink: await ctx.db.get(ids.magicLinkId),
      member: await ctx.db.get(ids.memberId),
      organization: await ctx.db.get(ids.organizationId),
      person: await ctx.db.get(ids.personId),
      session: await ctx.db.get(ids.sessionId),
      staff: await ctx.db.get(ids.staffId),
      successorMember: ids.successorMemberId ? await ctx.db.get(ids.successorMemberId) : null,
    }));
    expect(state).toMatchObject({
      assignment: null,
      audit: { action: "organization.person_removed", actorUserId: ids.userId },
      lineAccount: { isDeleted: true, following: false },
      canonicalLineLink: { isDeleted: true, unlinkedAt: NOW },
      canonicalProvider: { isDeleted: true, following: false },
      lineLinkToken: { revokedAt: NOW },
      magicLink: { revokedAt: NOW },
      member: { status: "removed" },
      organization: { isDeleted: false },
      person: { status: "removed" },
      session: { revokedAt: NOW },
      staff: { isDeleted: true },
      successorMember: { status: "active" },
    });
  });

  it("sole-admin組織の論理削除とcleanup jobを同じ受付で冪等に開始する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "account_delete_sole_admin",
        plan: "free",
      });
      const [organization, person, member] = await Promise.all([
        ctx.db.get(base.organizationId),
        ctx.db.get(base.personId),
        ctx.db.get(base.memberId),
      ]);
      if (!organization || !person || !member) throw new Error("sole admin actor not found");
      return { ...base, actor: { organization, person, member } };
    });
    const request = {
      actor: ids.actor,
      accountUserId: ids.userId,
      requestId: "account-delete-sole-admin",
      now: NOW,
    };

    const first = await t.run(async (ctx) => beginAccountDeletionOrganizationDeletion(ctx, request));
    const second = await t.run(async (ctx) => beginAccountDeletionOrganizationDeletion(ctx, request));
    expect(first).toEqual({
      organizationId: ids.organizationId,
      cleanupJobId: first.cleanupJobId,
      changed: true,
    });
    expect(second).toEqual({
      organizationId: ids.organizationId,
      cleanupJobId: first.cleanupJobId,
      changed: false,
    });

    const state = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      jobs: await ctx.db.query("deletionCleanupJobs").collect(),
      organization: await ctx.db.get(ids.organizationId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.organization).toMatchObject({ isDeleted: true, updatedAt: NOW });
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]).toMatchObject({
      _id: first.cleanupJobId,
      scope: "organization",
      organizationId: ids.organizationId,
      status: "queued",
    });
    expect(state.audits.map((audit) => audit.action)).toEqual(["organization.deleted"]);
    expect(state.scheduled.map((job) => job.name)).toEqual(["deletionCleanup/mutations:kick"]);
  });
});
