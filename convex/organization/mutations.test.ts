import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { addDays, todayJST } from "../_lib/dateFormat";
import { seedLegacyShopMembership, seedOrganizationManagerShop, seedStaffLineAccount, seedUser } from "../_test/seed";
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
    people: await ctx.db.query("organizationPeople").collect(),
    members: await ctx.db.query("organizationMembers").collect(),
    staffs: await ctx.db.query("staffs").collect(),
    assignments: await ctx.db.query("shiftAssignments").collect(),
    invitations: await ctx.db.query("organizationInvitations").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    billing: await ctx.db.query("organizationBillingStates").collect(),
    sessions: await ctx.db.query("sessions").collect(),
    magicLinks: await ctx.db.query("magicLinks").collect(),
    lineLinkTokens: await ctx.db.query("lineLinkTokens").collect(),
    lineAccounts: await ctx.db.query("staffLineAccounts").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

describe("organization person removal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("active管理者の店舗所属解除を副作用なしで拒否する", async () => {
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

    const before = await readManagerRemovalProtectedState(t);
    await expect(
      t.withIdentity({ subject: "shop_remove_actor" }).mutation(api.organization.mutations.removePersonFromShop, {
        shopId: ids.shopId,
        staffId: ids.staffIds[0],
        requestId: "shop-remove-request",
      }),
    ).rejects.toThrow("先に管理者権限を外してください。");
    expect(await readManagerRemovalProtectedState(t)).toEqual(before);
  });

  it.each(["archived", "planSuspended"] as const)(
    "%s店舗では未完了の店舗所属解除を拒否する",
    async (operatingStatus) => {
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
    },
  );

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
    ).rejects.toThrow("先に管理者権限を外してください。");
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

  it("契約制限中も復旧担当管理者の人物削除を副作用なしで拒否する", async () => {
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

    const before = await readManagerRemovalProtectedState(t);
    await expect(
      t.withIdentity({ subject: "recovery_actor" }).mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.shopId,
        personId: ids.personId,
        requestId: "recovery-manager",
      }),
    ).rejects.toThrow("先に管理者権限を外してください。");
    expect(await readManagerRemovalProtectedState(t)).toEqual(before);
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
    ).rejects.toThrow("先に管理者権限を外してください。");
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
    ).rejects.toThrow("先に管理者権限を外してください。");
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
    ).rejects.toThrow("管理者権限を外すには、先に請求先メールアドレスを変更してください。");
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
    ).rejects.toThrow("この機能はトライアルまたはProで利用できます。");
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

  it("別組織の人物IDと閲覧のみ管理者からの更新を拒否する", async () => {
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

    await t.run(async (ctx) => await ctx.db.patch(ids.actor.memberId, { status: "readOnly" }));
    await expect(
      actor.mutation(api.organization.mutations.updatePersonProfile, {
        shopId: ids.actor.shopId,
        personId: ids.actor.personId,
        name: "閲覧のみ更新",
        email: "profile-readonly@example.com",
        requestId: "person-profile-readonly",
      }),
    ).rejects.toThrow("Not found");
  });
});
