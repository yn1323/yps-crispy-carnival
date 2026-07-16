import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { addDays, todayJST } from "../_lib/dateFormat";
import { seedOrganizationManagerShop, seedShopMembership, seedStaffLineAccount, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

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
    if (args.manager) await seedShopMembership(ctx, { shopId, userId });
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

describe("organization person removal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("店舗から削除しても人物・管理者権限・他店舗所属・履歴を残し、対象店舗のリンクだけを失効する", async () => {
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

    const requestKey = await toAuditRequestKey("shop-remove-request");
    const state = await t.run(async (ctx) => ({
      assignment: await ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.recruitmentId))
        .first(),
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:person-removal:shop:${ids.staffIds[0]}:${requestKey}`),
        )
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
      legacyMemberships: await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", ids.userId).eq("isDeleted", false))
        .collect(),
    }));
    expect(state.staff?.isDeleted).toBe(true);
    expect(state.otherStaff?.isDeleted).toBe(false);
    expect(state.person?.status).toBe("active");
    expect(state.member?.status).toBe("active");
    expect(state.legacyMemberships).toHaveLength(2);
    expect(state.assignment).not.toBeNull();
    expect(state.session?.revokedAt).toBe(NOW);
    expect(state.magicLink?.revokedAt).toBe(NOW);
    expect(state.lineLinkToken?.revokedAt).toBe(NOW);
    expect(state.lineAccount).toMatchObject({ isDeleted: true, following: false });
    expect(state.staffOutbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.managerOutbox?.status).toBe("pending");
    expect(state.audit).toMatchObject({
      action: "organization.person_removed_from_shop",
      targetId: ids.personId,
    });

    await t.run((ctx) => ctx.db.patch(ids.shopId, { operatingStatus: "archived" }));
    await expect(
      t.withIdentity({ subject: "shop_remove_actor" }).mutation(api.organization.mutations.removePersonFromShop, {
        shopId: ids.shopId,
        staffId: ids.staffIds[0],
        requestId: "shop-remove-request",
      }),
    ).resolves.toEqual({ changed: false });
  });

  it.each([
    "archived",
    "planSuspended",
  ] as const)("%s店舗では未完了の店舗所属解除を拒否する", async (operatingStatus) => {
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

  it("事業者から削除すると全所属・権限・招待・リンク・業務通知を失効し、他事業者と履歴は残す", async () => {
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
      const otherOrganizationMembershipId = await seedShopMembership(ctx, {
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
        unrelatedOutboxId,
        userOutboxId,
      };
    });

    await expect(
      t
        .withIdentity({ subject: "org_remove_actor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "organization-remove-request",
        }),
    ).resolves.toEqual({ changed: true });

    const requestKey = await toAuditRequestKey("organization-remove-request");
    const state = await t.run(async (ctx) => ({
      assignment: await ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.recruitmentId))
        .first(),
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:person-removal:organization:${ids.personId}:${requestKey}`),
        )
        .first(),
      billingOutbox: await ctx.db.get(ids.billingOutboxId),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      invitation: await ctx.db.get(ids.invitationId),
      invitationOutbox: await ctx.db.get(ids.invitationOutboxId),
      legacyMemberships: await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", ids.userId).eq("isDeleted", false))
        .collect(),
      lineAccount: await ctx.db.get(ids.lineAccountId),
      member: await ctx.db.get(ids.memberId as Id<"organizationMembers">),
      otherOrganizationMembership: await ctx.db.get(ids.otherOrganizationMembershipId),
      otherOrganizationOutbox: await ctx.db.get(ids.otherOrganizationOutboxId),
      person: await ctx.db.get(ids.personId),
      session: await ctx.db.get(ids.sessionId),
      staffs: await Promise.all(ids.staffIds.map(async (staffId) => await ctx.db.get(staffId))),
      staffOutbox: await ctx.db.get(ids.staffOutboxId),
      unrelatedOutbox: await ctx.db.get(ids.unrelatedOutboxId),
      userOutbox: await ctx.db.get(ids.userOutboxId),
    }));
    expect(state.person?.status).toBe("removed");
    expect(state.member?.status).toBe("removed");
    expect(state.staffs.every((staff) => staff?.isDeleted)).toBe(true);
    expect(state.session?.revokedAt).toBe(NOW);
    expect(state.lineAccount).toMatchObject({ isDeleted: true, following: false });
    expect(state.invitation).toMatchObject({ status: "revoked", reservedSeat: false, version: 2 });
    expect(state.invitationOutbox).toMatchObject({ status: "cancelled", cancelReason: "invitation_inactive" });
    expect(state.staffOutbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.userOutbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.billingOutbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.billingState?.freeManagerPersonId).toBeUndefined();
    expect(state.billingState).toMatchObject({ version: 2, updatedAt: NOW });
    expect(state.unrelatedOutbox?.status).toBe("pending");
    expect(state.otherOrganizationMembership?.isDeleted).toBe(false);
    expect(state.otherOrganizationOutbox?.status).toBe("pending");
    expect(state.legacyMemberships.map((membership) => membership._id)).toEqual([ids.otherOrganizationMembershipId]);
    expect(state.assignment).not.toBeNull();
    expect(state.audit).toMatchObject({ action: "organization.person_removed", targetId: ids.personId });

    await expect(
      t
        .withIdentity({ subject: "org_remove_actor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "organization-remove-request",
        }),
    ).resolves.toEqual({ changed: false });
  });

  it("別の有効管理者がいれば自己削除でき、所属失効後の同一request再送も重複実行しない", async () => {
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
    await expect(call()).resolves.toEqual({ changed: true });
    await expect(call()).resolves.toEqual({ changed: false });

    const requestKey = await toAuditRequestKey("self-remove-request");
    const state = await t.run(async (ctx) => ({
      actorMember: await ctx.db.get(ids.memberId),
      actorPerson: await ctx.db.get(ids.personId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:person-removal:organization:${ids.personId}:${requestKey}`),
        )
        .collect(),
      successorMember: await ctx.db.get(ids.successorMemberId as Id<"organizationMembers">),
      successorPerson: await ctx.db.get(ids.successorPersonId),
    }));
    expect(state.actorMember?.status).toBe("removed");
    expect(state.actorPerson?.status).toBe("removed");
    expect(state.successorMember?.status).toBe("active");
    expect(state.successorPerson?.status).toBe("active");
    expect(state.audits).toHaveLength(1);
  });

  it.each(["shop", "organization"] as const)("%s削除は将来の有効な割当があると拒否する", async (scope) => {
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

    const request =
      scope === "shop"
        ? t
            .withIdentity({ subject: `future_${scope}_actor` })
            .mutation(api.organization.mutations.removePersonFromShop, {
              shopId: ids.shopId,
              staffId: ids.staffIds[0],
              requestId: `future-${scope}`,
            })
        : t
            .withIdentity({ subject: `future_${scope}_actor` })
            .mutation(api.organization.mutations.removePersonFromOrganization, {
              shopId: ids.shopId,
              personId: ids.personId,
              requestId: `future-${scope}`,
            });
    await expect(request).rejects.toThrow("将来のシフト割当を解除してから削除してください");
    await expect(t.run(async (ctx) => await ctx.db.get(ids.assignmentId))).resolves.not.toBeNull();
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("active");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.staffIds[0]))?.isDeleted)).resolves.toBe(false);
  });

  it("請求先メールアドレスの所有者は変更完了まで事業者から削除できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "billing_owner_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "billing_owner_target",
        shopIds: [],
        manager: true,
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
    ).rejects.toThrow("請求先メールアドレスを変更してから削除してください");
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
    ).rejects.toThrow("最後の有効管理者は削除できません");
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
    ).rejects.toThrow("最後の有効管理者は削除できません");
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
    ).rejects.toThrow("最後の有効管理者は削除できません");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("active");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.memberId))?.status)).resolves.toBe("active");
  });

  it("契約制限中に復旧担当者が複数いれば片方を削除し、復旧候補とFree選択を更新する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "recovery_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "recovery_target",
        shopIds: [],
        manager: true,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        freeManagerPersonId: target.personId,
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [base.personId, target.personId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: NOW,
        },
      });
      return { ...base, ...target, billingStateId: billingState._id, recoveryActorPersonId: base.personId };
    });

    await expect(
      t.withIdentity({ subject: "recovery_actor" }).mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "recovery-manager",
      }),
    ).resolves.toEqual({ changed: true });

    const state = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      billingState: await ctx.db.get(ids.billingStateId),
      person: await ctx.db.get(ids.personId),
    }));
    expect(state.person?.status).toBe("removed");
    expect(state.billingState?.state).toMatchObject({
      kind: "restricted",
      recoveryManagerPersonIds: [ids.recoveryActorPersonId],
    });
    if (state.billingState?.state.kind !== "restricted") throw new Error("billing state is not restricted");
    expect(state.billingState.state.recoveryManagerPersonIds).toEqual([ids.recoveryActorPersonId]);
    expect(state.billingState.freeManagerPersonId).toBeUndefined();
    expect(state.billingState).toMatchObject({ version: 2, updatedAt: NOW });
    expect(state.audits.map((audit) => audit.action)).toEqual(
      expect.arrayContaining([
        "organization.person_removed",
        "organization.recovery_managers_changed",
        "organization.free_selection_changed",
      ]),
    );
  });

  it("最後の復旧担当者は別の有効管理者がいても削除できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "last_recovery_actor", plan: "pro" });
      const successor = await seedTargetPerson(ctx, {
        base,
        subject: "last_recovery_successor",
        shopIds: [],
        manager: true,
      });
      await ctx.db.patch(base.organizationId, {
        billingEmail: successor.email,
        billingEmailNormalized: successor.email,
      });
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
          recoveryManagerPersonIds: [base.personId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: NOW,
        },
      });
      return { ...base, billingStateId: billingState._id };
    });

    await expect(
      t
        .withIdentity({ subject: "last_recovery_actor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "last-recovery-request",
        }),
    ).rejects.toThrow("最後の復旧担当者は削除できません");
    const state = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      person: await ctx.db.get(ids.personId),
    }));
    expect(state.person?.status).toBe("active");
    expect(state.billingState?.version).toBe(1);
  });

  it("所属重複でアクセス不能な復旧候補を有効な引継ぎ先として数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "last_recovery_duplicate_successor",
        plan: "pro",
      });
      const successor = await seedTargetPerson(ctx, {
        base,
        subject: "last_recovery_duplicate_target",
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
      await ctx.db.patch(base.organizationId, {
        billingEmail: "billing@example.com",
        billingEmailNormalized: "billing@example.com",
      });
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
          recoveryManagerPersonIds: [base.personId, successor.personId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: NOW,
        },
      });
      return base;
    });

    await expect(
      t
        .withIdentity({ subject: "last_recovery_duplicate_successor" })
        .mutation(api.organization.mutations.removePersonFromOrganization, {
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "last-recovery-duplicate-successor",
        }),
    ).rejects.toThrow("最後の復旧担当者は削除できません");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("active");
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
          q.eq("correlationId", `${ids.organizationId}:person-removal:managerRole:${ids.personId}:${requestKey}`),
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

  it("スタッフ所属がない管理者の権限解除は人物を事業者から削除する", async () => {
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
      member: await ctx.db.get(ids.memberId as Id<"organizationMembers">),
      person: await ctx.db.get(ids.personId),
    }));
    expect(state.member?.status).toBe("removed");
    expect(state.person?.status).toBe("removed");
  });

  it("スタッフ所属がない請求先所有者の管理権限は請求先変更前に外せない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_billing_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_billing_target",
        shopIds: [],
        manager: true,
      });
      await ctx.db.patch(base.organizationId, {
        billingEmail: target.email,
        billingEmailNormalized: target.email,
      });
      return { ...base, ...target };
    });
    await expect(
      t.withIdentity({ subject: "role_billing_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-billing-request",
      }),
    ).rejects.toThrow("請求先メールアドレスを変更してから削除してください");
  });

  it("スタッフ所属がなく将来シフトが残る管理者の権限は外せない", async () => {
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
      await seedAssignment(ctx, {
        shopId: base.shopId,
        staffId: target.staffIds[0],
        date: addDays(todayJST(), 1),
      });
      return { ...base, ...target };
    });
    await expect(
      t.withIdentity({ subject: "role_future_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-future-request",
      }),
    ).rejects.toThrow("将来のシフト割当を解除してから削除してください");
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
    ).rejects.toThrow("最後の有効管理者は削除できません");
  });

  it("Freeでは管理権限を個別に外せない", async () => {
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
    ).rejects.toThrow("この機能は無料体験、Pro、Businessで利用できます");
  });

  it("契約制限中は最後の復旧担当者の保護を優先して管理権限解除を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "role_restricted_actor", plan: "pro" });
      const target = await seedTargetPerson(ctx, {
        base,
        subject: "role_restricted_target",
        shopIds: [base.shopId],
        manager: true,
      });
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
          recoveryManagerPersonIds: [target.personId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: NOW,
        },
      });
      return { ...base, ...target };
    });
    await expect(
      t.withIdentity({ subject: "role_restricted_actor" }).mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "role-restricted-request",
      }),
    ).rejects.toThrow("最後の復旧担当者は削除できません");
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
