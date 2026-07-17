import type { MigrationResult } from "@convex-dev/migrations";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { modules, schema } from "../_test/setup.test-helper";
import { FORMER_MANAGER_ACCESS_CONFLICT_CODES } from "./migrations";

const NOW = 1_800_000_000_000;

function createMigrationTest() {
  return convexTest(schema, modules);
}

async function runM013(t: ReturnType<typeof createMigrationTest>, batchSize = 100) {
  let cursor: string | null = null;
  let processed = 0;
  for (;;) {
    const result: MigrationResult = await t.mutation(
      internal.migrations.m013_former_managers_remove_manager_access.migration,
      {
        batchSize,
        cursor,
        dryRun: false,
      },
    );
    processed += result.processed;
    if (result.isDone) return processed;
    cursor = result.continueCursor;
  }
}

async function runM014(t: ReturnType<typeof createMigrationTest>, batchSize = 100) {
  let cursor: string | null = null;
  let processed = 0;
  for (;;) {
    const result: MigrationResult = await t.mutation(
      internal.migrations.m014_removed_organization_members_delete_legacy_shop_members.migration,
      { batchSize, cursor, dryRun: false },
    );
    processed += result.processed;
    if (result.isDone) return processed;
    cursor = result.continueCursor;
  }
}

async function insertUser(ctx: MutationCtx, subject: string) {
  return await ctx.db.insert("users", {
    authTokenIdentifier: `https://convex.test|${subject}`,
    name: subject,
    email: `${subject}@example.com`,
    emailNormalized: `${subject}@example.com`,
    role: "manager",
    isDeleted: false,
  });
}

type BillingState =
  | { kind: "active"; plan: "free" | "pro" | "business" }
  | {
      kind: "restricted";
      reason: "freeConditionsNotMet";
      previousPlan: "pro";
      recoveryManagerPersonIds: Id<"organizationPeople">[];
      previousActiveShopIds: Id<"shops">[];
      restrictedAt: number;
    }
  | { kind: "complimentary"; plan: "business" };

async function seedFormerManagerFixture(
  ctx: MutationCtx,
  options: {
    billingKind?: "free" | "pro" | "complimentary";
    migrationSource?: boolean;
    excludedFromShift?: boolean;
    withOtherOrganization?: boolean;
  } = {},
) {
  const formerUserId = await insertUser(ctx, "former-manager");
  const successorUserId = await insertUser(ctx, "successor-manager");
  const organizationId = await ctx.db.insert("organizations", {
    createdByUserId: successorUserId,
    name: "交代対象グループ",
    billingEmail: "billing@example.com",
    billingEmailNormalized: "billing@example.com",
    isDeleted: false,
    createdAt: NOW - 10,
    updatedAt: NOW - 10,
  });
  const shopId = await ctx.db.insert("shops", {
    organizationId,
    operatingStatus: "active",
    name: "交代対象店舗",
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
  if (options.migrationSource) await ctx.db.patch(organizationId, { migrationSourceShopId: shopId });
  const successorPersonId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId: successorUserId,
    name: "新管理者",
    email: "successor-manager@example.com",
    emailNormalized: "successor-manager@example.com",
    status: "active",
    createdAt: NOW - 9,
    updatedAt: NOW - 9,
  });
  const successorMemberId = await ctx.db.insert("organizationMembers", {
    organizationId,
    personId: successorPersonId,
    userId: successorUserId,
    status: "active",
    createdAt: NOW - 8,
    updatedAt: NOW - 8,
  });
  const formerPersonId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId: formerUserId,
    name: "旧管理者",
    email: "former-manager@example.com",
    emailNormalized: "former-manager@example.com",
    status: "active",
    createdAt: NOW - 7,
    updatedAt: NOW - 7,
  });
  const formerMemberId = await ctx.db.insert("organizationMembers", {
    organizationId,
    personId: formerPersonId,
    userId: formerUserId,
    status: "readOnly",
    createdAt: NOW - 6,
    updatedAt: NOW,
  });
  const legacyMembershipId = await ctx.db.insert("shopMembers", {
    shopId,
    userId: formerUserId,
    role: "manager",
    isDeleted: false,
  });
  const staffId = await ctx.db.insert("staffs", {
    shopId,
    organizationId,
    organizationPersonId: formerPersonId,
    userId: formerUserId,
    name: "旧管理者スタッフ",
    email: "former-manager@example.com",
    emailNormalized: "former-manager@example.com",
    excludedFromShift: options.excludedFromShift ?? false,
    isDeleted: false,
  });
  const billingKind = options.billingKind ?? "free";
  const billingState: BillingState =
    billingKind === "free"
      ? { kind: "active", plan: "free" }
      : billingKind === "complimentary"
        ? { kind: "complimentary", plan: "business" }
        : { kind: "active", plan: "pro" };
  const billingStateId = await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: billingState,
    freeManagerPersonId: successorPersonId,
    freeShopId: shopId,
    version: 3,
    createdAt: NOW - 5,
    updatedAt: NOW - 5,
  });
  const invitationId = await ctx.db.insert("organizationInvitations", {
    organizationId,
    email: "pending@example.com",
    emailNormalized: "pending@example.com",
    tokenDigest: "pending-invitation-digest",
    status: "pending",
    purpose: "managerAddition",
    inviterMemberId: formerMemberId,
    reservedSeat: true,
    version: 1,
    expiresAt: NOW + 100_000,
    createdAt: NOW - 4,
    updatedAt: NOW - 4,
  });

  async function insertOutbox(args: { dedupeKey: string; purpose: "business" | "billing"; staffId?: Id<"staffs"> }) {
    return await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "pending",
      dedupeKey: args.dedupeKey,
      organizationId,
      shopId,
      staffId: args.staffId,
      userId: formerUserId,
      purpose: args.purpose,
      payload: {
        kind: "email",
        from: "noreply@example.com",
        to: "former-manager@example.com",
        subject: "件名",
        html: "本文",
        context: args.dedupeKey,
      },
      attemptCount: 0,
      nextRunAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  const managerNotificationId = await insertOutbox({ dedupeKey: "manager-notification", purpose: "business" });
  const billingNotificationId = await insertOutbox({ dedupeKey: "billing-notification", purpose: "billing" });
  const staffNotificationId = await insertOutbox({
    dedupeKey: "staff-shift-notification",
    purpose: "business",
    staffId,
  });

  let otherOrganization:
    | {
        organizationId: Id<"organizations">;
        personId: Id<"organizationPeople">;
        memberId: Id<"organizationMembers">;
        shopId: Id<"shops">;
        legacyMembershipId: Id<"shopMembers">;
      }
    | undefined;
  if (options.withOtherOrganization) {
    const otherOrganizationId = await ctx.db.insert("organizations", {
      createdByUserId: formerUserId,
      name: "別グループ",
      isDeleted: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherPersonId = await ctx.db.insert("organizationPeople", {
      organizationId: otherOrganizationId,
      userId: formerUserId,
      name: "別グループ管理者",
      email: "former-manager@example.com",
      emailNormalized: "former-manager@example.com",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherMemberId = await ctx.db.insert("organizationMembers", {
      organizationId: otherOrganizationId,
      personId: otherPersonId,
      userId: formerUserId,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherShopId = await ctx.db.insert("shops", {
      organizationId: otherOrganizationId,
      operatingStatus: "active",
      name: "別店舗",
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
      regularClosedDays: [],
      isDeleted: false,
    });
    const otherLegacyMembershipId = await ctx.db.insert("shopMembers", {
      shopId: otherShopId,
      userId: formerUserId,
      role: "manager",
      isDeleted: false,
    });
    await ctx.db.insert("organizationBillingStates", {
      organizationId: otherOrganizationId,
      state: { kind: "active", plan: "pro" },
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    otherOrganization = {
      organizationId: otherOrganizationId,
      personId: otherPersonId,
      memberId: otherMemberId,
      shopId: otherShopId,
      legacyMembershipId: otherLegacyMembershipId,
    };
  }

  return {
    organizationId,
    shopId,
    successorPersonId,
    successorMemberId,
    formerUserId,
    formerPersonId,
    formerMemberId,
    legacyMembershipId,
    staffId,
    billingStateId,
    invitationId,
    managerNotificationId,
    billingNotificationId,
    staffNotificationId,
    otherOrganization,
  };
}

async function migrationSnapshot(ctx: MutationCtx) {
  const stable = <T extends { _id: string }>(rows: T[]) => rows.sort((a, b) => a._id.localeCompare(b._id));
  return {
    members: stable(await ctx.db.query("organizationMembers").collect()),
    shopMembers: stable(await ctx.db.query("shopMembers").collect()),
    people: stable(await ctx.db.query("organizationPeople").collect()),
    staffs: stable(await ctx.db.query("staffs").collect()),
    users: stable(await ctx.db.query("users").collect()),
    invitations: stable(await ctx.db.query("organizationInvitations").collect()),
    notifications: stable(await ctx.db.query("notificationOutbox").collect()),
    audits: stable(await ctx.db.query("organizationAuditEvents").collect()),
    conflicts: stable(await ctx.db.query("organizationMigrationConflicts").collect()),
  };
}

describe("旧管理者アクセス移行", () => {
  it("1件batchでFreeの旧管理者だけを失効し、staffとシフト通知と別グループを完全に維持する", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => await seedFormerManagerFixture(ctx, { withOtherOrganization: true }));
    const before = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.formerUserId),
      person: await ctx.db.get(ids.formerPersonId),
      staffs: await ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", ids.organizationId).eq("organizationPersonId", ids.formerPersonId),
        )
        .collect(),
    }));

    expect(await runM013(t, 1)).toBeGreaterThanOrEqual(2);
    expect(await runM014(t, 1)).toBeGreaterThanOrEqual(2);

    const after = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      legacyMembership: await ctx.db.get(ids.legacyMembershipId),
      user: await ctx.db.get(ids.formerUserId),
      person: await ctx.db.get(ids.formerPersonId),
      staffs: await ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", ids.organizationId).eq("organizationPersonId", ids.formerPersonId),
        )
        .collect(),
      invitation: await ctx.db.get(ids.invitationId),
      managerNotification: await ctx.db.get(ids.managerNotificationId),
      billingNotification: await ctx.db.get(ids.billingNotificationId),
      staffNotification: await ctx.db.get(ids.staffNotificationId),
      otherMember: ids.otherOrganization ? await ctx.db.get(ids.otherOrganization.memberId) : null,
      otherLegacy: ids.otherOrganization ? await ctx.db.get(ids.otherOrganization.legacyMembershipId) : null,
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      allStaffIds: (await ctx.db.query("staffs").collect()).map((staff) => staff._id).sort(),
    }));

    expect(after.member?.status).toBe("removed");
    expect(after.legacyMembership?.isDeleted).toBe(true);
    expect(after.user).toEqual(before.user);
    expect(after.person).toEqual(before.person);
    expect(after.staffs).toEqual(before.staffs);
    expect(after.allStaffIds).toEqual([ids.staffId]);
    expect(after.invitation).toMatchObject({ status: "revoked", reservedSeat: false });
    expect(after.managerNotification?.status).toBe("cancelled");
    expect(after.billingNotification?.status).toBe("cancelled");
    expect(after.staffNotification?.status).toBe("pending");
    expect(after.otherMember?.status).toBe("active");
    expect(after.otherLegacy?.isDeleted).toBe(false);
    expect(
      after.audits.map((audit) => ({ action: audit.action, targetId: audit.targetId, toState: audit.toState })),
    ).toEqual([{ action: "organization.manager_role_removed", targetId: ids.formerPersonId, toState: "staffOnly" }]);
    expect(after.conflicts).toEqual([]);

    const idempotentBefore = await t.run(migrationSnapshot);
    await runM013(t, 1);
    await runM014(t, 1);
    expect(await t.run(migrationSnapshot)).toEqual(idempotentBefore);
  });

  it("旧店舗所属が重複する対象をconflictへ送り、同じbatchの後続対象は処理を継続する", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const conflicted = await seedFormerManagerFixture(ctx);
      const duplicateLegacyMembershipId = await ctx.db.insert("shopMembers", {
        shopId: conflicted.shopId,
        userId: conflicted.formerUserId,
        role: "manager",
        isDeleted: false,
      });
      const continued = await seedFormerManagerFixture(ctx);
      return { conflicted, continued, duplicateLegacyMembershipId };
    });
    const beforeStaff = await t.run(async (ctx) => await ctx.db.get(ids.conflicted.staffId));

    await runM013(t, 1);

    const result = await t.run(async (ctx) => ({
      conflictedMember: await ctx.db.get(ids.conflicted.formerMemberId),
      conflictedLegacyMembership: await ctx.db.get(ids.conflicted.legacyMembershipId),
      duplicateLegacyMembership: await ctx.db.get(ids.duplicateLegacyMembershipId),
      conflictedStaff: await ctx.db.get(ids.conflicted.staffId),
      continuedMember: await ctx.db.get(ids.continued.formerMemberId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "organizationMember").eq("sourceId", ids.conflicted.formerMemberId),
        )
        .collect(),
      conflictedAudits: (await ctx.db.query("organizationAuditEvents").collect()).filter(
        (audit) => audit.targetId === ids.conflicted.formerPersonId,
      ),
    }));
    expect(result.conflictedMember?.status).toBe("readOnly");
    expect(result.conflictedLegacyMembership?.isDeleted).toBe(false);
    expect(result.duplicateLegacyMembership?.isDeleted).toBe(false);
    expect(result.conflictedStaff).toEqual(beforeStaff);
    expect(result.continuedMember?.status).toBe("removed");
    expect(result.conflicts.map((conflict) => ({ code: conflict.code, resolvedAt: conflict.resolvedAt }))).toEqual([
      {
        code: FORMER_MANAGER_ACCESS_CONFLICT_CODES.ambiguousLegacyMembership,
        resolvedAt: undefined,
      },
    ]);
    expect(result.conflictedAudits).toEqual([]);
  });

  it("current Freeの選択先自身がreadOnlyならclean扱いにせずinvalid selection conflictへ送る", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx);
      await ctx.db.patch(ids.billingStateId, { freeManagerPersonId: ids.formerPersonId });
      return ids;
    });
    const before = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.formerPersonId),
      staff: await ctx.db.get(ids.staffId),
    }));

    await runM013(t);

    const result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      legacyMembership: await ctx.db.get(ids.legacyMembershipId),
      person: await ctx.db.get(ids.formerPersonId),
      staff: await ctx.db.get(ids.staffId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "organizationMember").eq("sourceId", ids.formerMemberId),
        )
        .collect(),
      audits: (await ctx.db.query("organizationAuditEvents").collect()).filter(
        (audit) => audit.targetId === ids.formerPersonId,
      ),
    }));
    expect(result.member?.status).toBe("readOnly");
    expect(result.legacyMembership?.isDeleted).toBe(false);
    expect(result.person).toEqual(before.person);
    expect(result.staff).toEqual(before.staff);
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      FORMER_MANAGER_ACCESS_CONFLICT_CODES.currentFreeSelectionInvalid,
    ]);
    expect(result.audits).toEqual([]);
  });

  it("有料状態のreadOnlyがfreeManagerPersonIdから参照中でも履歴不明ならorigin conflictへ送る", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
      await ctx.db.patch(ids.billingStateId, { freeManagerPersonId: ids.formerPersonId });
      return ids;
    });

    await runM013(t);

    const result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "organizationMember").eq("sourceId", ids.formerMemberId),
        )
        .collect(),
    }));
    expect(result.member?.status).toBe("readOnly");
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      FORMER_MANAGER_ACCESS_CONFLICT_CODES.originAmbiguous,
    ]);
  });

  it("m014を先に実行しても旧所属を変更せず、m013後だけ対応行を削除済みにする", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => await seedFormerManagerFixture(ctx));

    await runM014(t, 1);
    expect(await t.run(async (ctx) => (await ctx.db.get(ids.legacyMembershipId))?.isDeleted)).toBe(false);

    await runM013(t, 1);
    await runM014(t, 1);
    expect(await t.run(async (ctx) => (await ctx.db.get(ids.legacyMembershipId))?.isDeleted)).toBe(true);
  });

  it("m014は店舗・人物・canonical所属が曖昧な旧所属を変更せず固有conflictだけを記録する", async () => {
    const cases = [
      {
        code: "removed_member_legacy_membership_missing_organization_shop",
        arrange: async (ctx: MutationCtx, ids: Awaited<ReturnType<typeof seedFormerManagerFixture>>) => {
          await ctx.db.patch(ids.shopId, { organizationId: undefined });
        },
      },
      {
        code: "removed_member_legacy_membership_ambiguous_organization_person",
        arrange: async (ctx: MutationCtx, ids: Awaited<ReturnType<typeof seedFormerManagerFixture>>) => {
          await ctx.db.insert("organizationPeople", {
            organizationId: ids.organizationId,
            userId: ids.formerUserId,
            name: "重複人物",
            email: "former-manager@example.com",
            emailNormalized: "former-manager@example.com",
            status: "active",
            createdAt: NOW,
            updatedAt: NOW,
          });
        },
      },
      {
        code: "removed_member_legacy_membership_ambiguous_canonical_member",
        arrange: async (ctx: MutationCtx, ids: Awaited<ReturnType<typeof seedFormerManagerFixture>>) => {
          await ctx.db.insert("organizationMembers", {
            organizationId: ids.organizationId,
            personId: ids.formerPersonId,
            userId: ids.formerUserId,
            status: "readOnly",
            createdAt: NOW,
            updatedAt: NOW,
          });
        },
      },
    ];

    for (const testCase of cases) {
      const t = createMigrationTest();
      const ids = await t.run(async (ctx) => {
        const ids = await seedFormerManagerFixture(ctx);
        await testCase.arrange(ctx, ids);
        return ids;
      });

      await runM014(t);
      const state = await t.run(async (ctx) => ({
        legacyMembership: await ctx.db.get(ids.legacyMembershipId),
        conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
      }));
      expect(state.legacyMembership?.isDeleted).toBe(false);
      expect(state.conflicts.map((conflict) => conflict.code)).toEqual([testCase.code]);
      expect(state.audits).toEqual([]);
    }
  });

  it("dry runではmember、旧所属、監査、conflict、通知を書き換えない", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => await seedFormerManagerFixture(ctx));
    const beforeM013 = await t.run(migrationSnapshot);

    await expect(
      t.mutation(internal.migrations.m013_former_managers_remove_manager_access.migration, {
        batchSize: 100,
        cursor: null,
        dryRun: true,
      }),
    ).rejects.toThrowError();
    expect(await t.run(migrationSnapshot)).toEqual(beforeM013);

    await t.run(async (ctx) => await ctx.db.patch(ids.formerMemberId, { status: "removed" }));
    const beforeM014 = await t.run(migrationSnapshot);
    await expect(
      t.mutation(internal.migrations.m014_removed_organization_members_delete_legacy_shop_members.migration, {
        batchSize: 100,
        cursor: null,
        dryRun: true,
      }),
    ).rejects.toThrowError();
    expect(await t.run(migrationSnapshot)).toEqual(beforeM014);
  });

  it("一致するFree交代招待と監査があれば現在Proまたは無償Businessでも旧管理者を失効する", async () => {
    for (const billingKind of ["pro", "complimentary"] as const) {
      const t = createMigrationTest();
      const ids = await t.run(async (ctx) => {
        const ids = await seedFormerManagerFixture(ctx, { billingKind });
        const exchangeId = await ctx.db.insert("organizationInvitations", {
          organizationId: ids.organizationId,
          email: "successor-manager@example.com",
          emailNormalized: "successor-manager@example.com",
          tokenDigest: `accepted-exchange-digest-${billingKind}`,
          status: "accepted",
          purpose: "freeManagerExchange",
          inviterMemberId: ids.formerMemberId,
          reservedSeat: false,
          version: 2,
          expiresAt: NOW + 1,
          acceptedAt: NOW,
          acceptedByPersonId: ids.successorPersonId,
          createdAt: NOW - 1,
          updatedAt: NOW,
        });
        await ctx.db.insert("organizationAuditEvents", {
          organizationId: ids.organizationId,
          action: "organization.free_selection_changed",
          targetKind: "billing",
          targetId: ids.billingStateId,
          fromState: `manager:${ids.formerPersonId}`,
          toState: `manager:${ids.successorPersonId}`,
          correlationId: `${exchangeId}:free-manager-exchange:1`,
          occurredAt: NOW,
        });
        return ids;
      });

      await runM013(t);
      expect(await t.run(async (ctx) => (await ctx.db.get(ids.formerMemberId))?.status)).toBe("removed");
    }
  });

  it("履歴上の交代先がremovedでも別のactive管理者が残る有料状態なら旧管理者を失効する", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
      await ctx.db.patch(ids.successorMemberId, { status: "removed", updatedAt: NOW + 1 });
      const currentUserId = await insertUser(ctx, "current-manager");
      const currentPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: ids.organizationId,
        userId: currentUserId,
        name: "現在の管理者",
        email: "current-manager@example.com",
        emailNormalized: "current-manager@example.com",
        status: "active",
        createdAt: NOW + 1,
        updatedAt: NOW + 1,
      });
      const currentMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: ids.organizationId,
        personId: currentPersonId,
        userId: currentUserId,
        status: "active",
        createdAt: NOW + 1,
        updatedAt: NOW + 1,
      });
      const exchangeId = await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        email: "successor-manager@example.com",
        emailNormalized: "successor-manager@example.com",
        tokenDigest: "accepted-exchange-old-successor-removed",
        status: "accepted",
        purpose: "freeManagerExchange",
        inviterMemberId: ids.formerMemberId,
        reservedSeat: false,
        version: 2,
        expiresAt: NOW + 1,
        acceptedAt: NOW,
        acceptedByPersonId: ids.successorPersonId,
        createdAt: NOW - 1,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: ids.organizationId,
        action: "organization.free_selection_changed",
        targetKind: "billing",
        targetId: ids.billingStateId,
        fromState: `manager:${ids.formerPersonId}`,
        toState: `manager:${ids.successorPersonId}`,
        correlationId: `${exchangeId}:free-manager-exchange:1`,
        occurredAt: NOW,
      });
      return { ...ids, currentMemberId };
    });

    await runM013(t);

    const result = await t.run(async (ctx) => ({
      formerMember: await ctx.db.get(ids.formerMemberId),
      currentMember: await ctx.db.get(ids.currentMemberId),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(result.formerMember?.status).toBe("removed");
    expect(result.currentMember?.status).toBe("active");
    expect(result.conflicts).toEqual([]);
  });

  it("有料状態でFree交代履歴があっても対象がfreeManagerPersonIdから参照中なら自動失効しない", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
      const exchangeId = await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        email: "successor-manager@example.com",
        emailNormalized: "successor-manager@example.com",
        tokenDigest: "accepted-exchange-referenced-manager",
        status: "accepted",
        purpose: "freeManagerExchange",
        inviterMemberId: ids.formerMemberId,
        reservedSeat: false,
        version: 2,
        expiresAt: NOW + 1,
        acceptedAt: NOW,
        acceptedByPersonId: ids.successorPersonId,
        createdAt: NOW - 1,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: ids.organizationId,
        action: "organization.free_selection_changed",
        targetKind: "billing",
        targetId: ids.billingStateId,
        fromState: `manager:${ids.formerPersonId}`,
        toState: `manager:${ids.successorPersonId}`,
        correlationId: `${exchangeId}:free-manager-exchange:1`,
        occurredAt: NOW,
      });
      await ctx.db.patch(ids.billingStateId, { freeManagerPersonId: ids.formerPersonId });
      return ids;
    });

    await runM013(t);

    const result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "organizationMember").eq("sourceId", ids.formerMemberId),
        )
        .collect(),
    }));
    expect(result.member?.status).toBe("readOnly");
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      FORMER_MANAGER_ACCESS_CONFLICT_CODES.referencedFreeManager,
    ]);
  });

  it("過去のFree適用監査とmember更新時刻が一致するときだけProと契約制限中の旧管理者を失効する", async () => {
    for (const currentState of ["pro", "restricted"] as const) {
      const t = createMigrationTest();
      const ids = await t.run(async (ctx) => {
        const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
        if (currentState === "restricted") {
          await ctx.db.patch(ids.billingStateId, {
            state: {
              kind: "restricted",
              reason: "freeConditionsNotMet",
              previousPlan: "pro",
              recoveryManagerPersonIds: [ids.successorPersonId],
              previousActiveShopIds: [ids.shopId],
              restrictedAt: NOW + 1,
            },
            version: 4,
          });
        }
        await ctx.db.insert("organizationAuditEvents", {
          organizationId: ids.organizationId,
          action: "organization.free_selection_changed",
          targetKind: "billing",
          targetId: ids.billingStateId,
          correlationId: `free-selection-${currentState}`,
          occurredAt: NOW - 1,
        });
        await ctx.db.insert("organizationAuditEvents", {
          organizationId: ids.organizationId,
          action: "organization.billing_state_changed",
          targetKind: "billing",
          targetId: ids.billingStateId,
          fromState: "scheduledChange",
          toState: "free",
          correlationId: `free-applied-${currentState}`,
          occurredAt: NOW,
        });
        return ids;
      });

      await runM013(t);
      expect(await t.run(async (ctx) => (await ctx.db.get(ids.formerMemberId))?.status)).toBe("removed");
    }

    const mismatched = createMigrationTest();
    const mismatchedIds = await mismatched.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: ids.organizationId,
        action: "organization.free_selection_changed",
        targetKind: "billing",
        targetId: ids.billingStateId,
        correlationId: "free-selection-mismatched",
        occurredAt: NOW - 2,
      });
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: ids.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: ids.billingStateId,
        fromState: "scheduledChange",
        toState: "free",
        correlationId: "free-applied-mismatched",
        occurredAt: NOW - 1,
      });
      return ids;
    });
    await runM013(mismatched);
    const mismatchedState = await mismatched.run(async (ctx) => ({
      member: await ctx.db.get(mismatchedIds.formerMemberId),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(mismatchedState.member?.status).toBe("readOnly");
    expect(mismatchedState.conflicts.map((conflict) => conflict.code)).toEqual([
      FORMER_MANAGER_ACCESS_CONFLICT_CODES.originAmbiguous,
    ]);
  });

  it("Free交代後に本人のmanagerAdditionが承認されていれば自動失効せず履歴conflictにする", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
      const exchangeId = await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        email: "successor-manager@example.com",
        emailNormalized: "successor-manager@example.com",
        tokenDigest: "accepted-exchange-before-readdition",
        status: "accepted",
        purpose: "freeManagerExchange",
        inviterMemberId: ids.formerMemberId,
        reservedSeat: false,
        version: 2,
        expiresAt: NOW + 1,
        acceptedAt: NOW,
        acceptedByPersonId: ids.successorPersonId,
        createdAt: NOW - 1,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: ids.organizationId,
        action: "organization.free_selection_changed",
        targetKind: "billing",
        targetId: ids.billingStateId,
        fromState: `manager:${ids.formerPersonId}`,
        toState: `manager:${ids.successorPersonId}`,
        correlationId: `${exchangeId}:free-manager-exchange:1`,
        occurredAt: NOW,
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        email: "former-manager@example.com",
        emailNormalized: "former-manager@example.com",
        tokenDigest: "accepted-manager-readdition",
        status: "accepted",
        purpose: "managerAddition",
        inviterMemberId: ids.successorMemberId,
        reservedSeat: false,
        version: 2,
        expiresAt: NOW + 2,
        acceptedAt: NOW + 1,
        acceptedByPersonId: ids.formerPersonId,
        createdAt: NOW,
        updatedAt: NOW + 1,
      });
      return ids;
    });

    await runM013(t);
    const state = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      roleRemovalAudits: (await ctx.db.query("organizationAuditEvents").collect()).filter(
        (audit) => audit.action === "organization.manager_role_removed",
      ),
    }));
    expect(state.member?.status).toBe("readOnly");
    expect(state.conflicts.map((conflict) => conflict.code)).toEqual([
      FORMER_MANAGER_ACCESS_CONFLICT_CODES.historyConflict,
    ]);
    expect(state.roleRemovalAudits).toEqual([]);
  });

  it("m012の安全条件を満たさない移行元グループは一件のowned conflictで停止する", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => await seedFormerManagerFixture(ctx, { migrationSource: true }));

    await runM013(t);
    await runM013(t);

    const result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "organizationMember").eq("sourceId", ids.formerMemberId),
        )
        .collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
    }));
    expect(result.member?.status).toBe("readOnly");
    expect(result.audits).toEqual([]);
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      FORMER_MANAGER_ACCESS_CONFLICT_CODES.m012GateIncomplete,
    ]);
  });

  it("契約制限中の復旧担当者を維持し、非復旧readOnlyだけを曖昧conflictにする", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
      const billing = await ctx.db.get(ids.billingStateId);
      if (!billing) throw new Error("billing state is required");
      await ctx.db.patch(ids.billingStateId, {
        freeManagerPersonId: ids.formerPersonId,
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [ids.successorPersonId, ids.formerPersonId],
          previousActiveShopIds: [ids.shopId],
          restrictedAt: NOW,
        },
        version: billing.version + 1,
      });
      return ids;
    });

    await runM013(t);
    let result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(result.member?.status).toBe("readOnly");
    expect(result.conflicts).toEqual([]);

    await t.run(async (ctx) => {
      const billing = await ctx.db.get(ids.billingStateId);
      if (billing?.state.kind !== "restricted") throw new Error("restricted state is required");
      await ctx.db.patch(ids.billingStateId, {
        state: { ...billing.state, recoveryManagerPersonIds: [ids.successorPersonId] },
        version: billing.version + 1,
      });
    });
    await runM013(t);
    result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));
    expect(result.member?.status).toBe("readOnly");
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      FORMER_MANAGER_ACCESS_CONFLICT_CODES.restrictedOriginAmbiguous,
    ]);
  });

  it("internal削除裁定はstatus・updatedAt・残存管理者・owned code・課金参照の不一致を副作用なく拒否する", async () => {
    type ExpectedOverride = {
      expectedUpdatedAt?: number;
      expectedBillingVersion?: number;
      expectedBillingStateKind?: "active" | "restricted";
    };
    const cases: Array<{
      name: string;
      conflictCode?: string;
      arrange?: (
        ctx: MutationCtx,
        ids: Awaited<ReturnType<typeof seedFormerManagerFixture>>,
      ) => Promise<ExpectedOverride>;
      expected?: ExpectedOverride;
    }> = [
      {
        name: "status",
        arrange: async (ctx, ids) => {
          await ctx.db.patch(ids.formerMemberId, { status: "active" });
          return {};
        },
      },
      { name: "updated-at", expected: { expectedUpdatedAt: NOW + 1 } },
      {
        name: "remaining-manager",
        arrange: async (ctx, ids) => {
          await ctx.db.patch(ids.successorMemberId, { status: "removed" });
          return {};
        },
      },
      { name: "owned-code", conflictCode: "complimentary_business_existing_billing_state" },
      {
        name: "free-manager-reference",
        arrange: async (ctx, ids) => {
          await ctx.db.patch(ids.billingStateId, { freeManagerPersonId: ids.formerPersonId });
          return {};
        },
      },
      {
        name: "legacy-membership-duplicate",
        conflictCode: FORMER_MANAGER_ACCESS_CONFLICT_CODES.ambiguousLegacyMembership,
        arrange: async (ctx, ids) => {
          await ctx.db.insert("shopMembers", {
            shopId: ids.shopId,
            userId: ids.formerUserId,
            role: "manager",
            isDeleted: false,
          });
          return {};
        },
      },
      {
        name: "recovery-manager-reference",
        arrange: async (ctx, ids) => {
          await ctx.db.patch(ids.billingStateId, {
            state: {
              kind: "restricted",
              reason: "freeConditionsNotMet",
              previousPlan: "pro",
              recoveryManagerPersonIds: [ids.formerPersonId, ids.successorPersonId],
              previousActiveShopIds: [ids.shopId],
              restrictedAt: NOW,
            },
            version: 4,
          });
          return { expectedBillingVersion: 4, expectedBillingStateKind: "restricted" };
        },
      },
    ];

    for (const testCase of cases) {
      const t = createMigrationTest();
      const ids = await t.run(async (ctx) => {
        const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
        const conflictId = await ctx.db.insert("organizationMigrationConflicts", {
          organizationId: ids.organizationId,
          sourceType: "organizationMember",
          sourceId: ids.formerMemberId,
          code: testCase.conflictCode ?? FORMER_MANAGER_ACCESS_CONFLICT_CODES.originAmbiguous,
          createdAt: NOW,
        });
        const arranged = (await testCase.arrange?.(ctx, ids)) ?? {};
        return { ...ids, conflictId, ...arranged };
      });
      const expected = { ...testCase.expected, ...ids };
      const before = await t.run(migrationSnapshot);
      await expect(
        t.mutation(internal.organization.migrations.resolveFormerManagerAccessConflict, {
          conflictId: ids.conflictId,
          organizationMemberId: ids.formerMemberId,
          expectedUpdatedAt: expected.expectedUpdatedAt ?? NOW,
          expectedBillingVersion: expected.expectedBillingVersion ?? 3,
          expectedBillingStateKind: expected.expectedBillingStateKind ?? "active",
          decision: "removeManagerAccess",
          reasonCode: "formerManagerConfirmed",
          requestId: `reject-${testCase.name}`,
        }),
      ).rejects.toThrowError();
      expect(await t.run(migrationSnapshot)).toEqual(before);
    }
  });

  it("internal裁定はexpected値とowned conflictを再確認し、staff通知を残して冪等に権限解除する", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro", withOtherOrganization: true });
      const conflictId = await ctx.db.insert("organizationMigrationConflicts", {
        organizationId: ids.organizationId,
        sourceType: "organizationMember",
        sourceId: ids.formerMemberId,
        code: FORMER_MANAGER_ACCESS_CONFLICT_CODES.originAmbiguous,
        createdAt: NOW,
      });
      return { ...ids, conflictId };
    });
    const beforeStaff = await t.run(async (ctx) => await ctx.db.get(ids.staffId));
    const args = {
      conflictId: ids.conflictId,
      organizationMemberId: ids.formerMemberId,
      expectedUpdatedAt: NOW,
      expectedBillingVersion: 3,
      expectedBillingStateKind: "active" as const,
      decision: "removeManagerAccess" as const,
      reasonCode: "formerManagerConfirmed" as const,
      requestId: "migration-arbitration-request",
    };

    await expect(
      t.mutation(internal.organization.migrations.resolveFormerManagerAccessConflict, {
        ...args,
        expectedBillingVersion: 99,
      }),
    ).rejects.toThrowError();
    expect(await t.run(async (ctx) => (await ctx.db.get(ids.formerMemberId))?.status)).toBe("readOnly");

    await expect(
      t.mutation(internal.organization.migrations.resolveFormerManagerAccessConflict, args),
    ).resolves.toEqual({
      changed: true,
    });
    await expect(
      t.mutation(internal.organization.migrations.resolveFormerManagerAccessConflict, args),
    ).resolves.toEqual({
      changed: false,
    });

    const result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      staff: await ctx.db.get(ids.staffId),
      staffNotification: await ctx.db.get(ids.staffNotificationId),
      managerNotification: await ctx.db.get(ids.managerNotificationId),
      conflict: await ctx.db.get(ids.conflictId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      otherMember: ids.otherOrganization ? await ctx.db.get(ids.otherOrganization.memberId) : null,
    }));
    expect(result.member?.status).toBe("removed");
    expect(result.staff).toEqual(beforeStaff);
    expect(result.staffNotification?.status).toBe("pending");
    expect(result.managerNotification?.status).toBe("cancelled");
    expect(result.conflict?.resolvedAt).toBeTypeOf("number");
    expect(result.audits.map((audit) => audit.action)).toEqual(["organization.manager_role_removed"]);
    expect(result.otherMember?.status).toBe("active");
  });

  it("readOnly維持裁定は課金versionを監査し、状態変更後は古い裁定を流用しない", async () => {
    const t = createMigrationTest();
    const ids = await t.run(async (ctx) => {
      const ids = await seedFormerManagerFixture(ctx, { billingKind: "pro" });
      await ctx.db.patch(ids.billingStateId, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [ids.successorPersonId, ids.formerPersonId],
          previousActiveShopIds: [ids.shopId],
          restrictedAt: NOW,
        },
        version: 4,
      });
      const conflictId = await ctx.db.insert("organizationMigrationConflicts", {
        organizationId: ids.organizationId,
        sourceType: "organizationMember",
        sourceId: ids.formerMemberId,
        code: FORMER_MANAGER_ACCESS_CONFLICT_CODES.restrictedOriginAmbiguous,
        createdAt: NOW,
      });
      return { ...ids, conflictId };
    });

    const args = {
      conflictId: ids.conflictId,
      organizationMemberId: ids.formerMemberId,
      expectedUpdatedAt: NOW,
      expectedBillingVersion: 4,
      expectedBillingStateKind: "restricted" as const,
      decision: "keepAuthorizedReadOnly" as const,
      reasonCode: "restrictedRecoveryManager" as const,
      requestId: "keep-recovery-manager",
    };
    await expect(
      t.mutation(internal.organization.migrations.resolveFormerManagerAccessConflict, args),
    ).resolves.toEqual({
      changed: true,
    });
    await expect(
      t.mutation(internal.organization.migrations.resolveFormerManagerAccessConflict, args),
    ).resolves.toEqual({
      changed: false,
    });

    await runM013(t);
    const unchangedReviewState = await t.run(async (ctx) => ({
      conflict: await ctx.db.get(ids.conflictId),
      reviews: (await ctx.db.query("organizationAuditEvents").collect()).filter(
        (audit) => audit.action === "organization.manager_access_reviewed",
      ),
    }));
    expect(unchangedReviewState.conflict?.resolvedAt).toBeTypeOf("number");
    expect(unchangedReviewState.reviews).toHaveLength(1);

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.billingStateId, {
        state: { kind: "active", plan: "pro" },
        version: 5,
        updatedAt: NOW + 1,
      });
    });
    await runM013(t);
    const result = await t.run(async (ctx) => ({
      member: await ctx.db.get(ids.formerMemberId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "organizationMember").eq("sourceId", ids.formerMemberId),
        )
        .collect(),
      reviews: (await ctx.db.query("organizationAuditEvents").collect()).filter(
        (audit) => audit.action === "organization.manager_access_reviewed",
      ),
    }));
    expect(result.member?.status).toBe("readOnly");
    expect(result.reviews).toHaveLength(1);
    expect(
      result.conflicts
        .map((conflict) => ({ code: conflict.code, resolved: conflict.resolvedAt !== undefined }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual(
      [
        { code: FORMER_MANAGER_ACCESS_CONFLICT_CODES.originAmbiguous, resolved: false },
        { code: FORMER_MANAGER_ACCESS_CONFLICT_CODES.restrictedOriginAmbiguous, resolved: true },
      ].sort((a, b) => a.code.localeCompare(b.code)),
    );
  });
});
