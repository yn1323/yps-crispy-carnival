import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate } from "../_test/scenarioBuilders";
import { seedOrganizationManagerShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const TARGET_SUBJECT = "organization_removal_target";

async function seedShop(ctx: MutationCtx, organizationId: Id<"organizations">, name: string) {
  return await ctx.db.insert("shops", {
    organizationId,
    operatingStatus: "active",
    name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
}

async function seedRecruitment(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    periodStart: string;
    periodEnd: string;
    status: "open" | "confirmed";
  },
) {
  return await ctx.db.insert("recruitments", {
    shopId: args.shopId,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    deadline: args.periodStart,
    shopClosedDates: [],
    status: args.status,
    ...(args.status === "confirmed" ? { confirmedAt: SCENARIO_NOW } : {}),
    isDeleted: false,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
}

describe("割当付き組織人物削除シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("今日以降の割当と対象アクセスだけを削除し、過去履歴・別人物・別組織を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const alternate = await seedOrganizationManagerShop(ctx, {
        subject: TARGET_SUBJECT,
        email: "removal-target@example.com",
        shopName: "削除対象の別グループ店舗",
        plan: "pro",
      });
      const primary = await seedOrganizationManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "removal-actor@example.com",
        shopName: "人物削除メイン店舗",
        plan: "pro",
      });
      const secondaryShopId = await seedShop(ctx, primary.organizationId, "人物削除サブ店舗");
      const targetPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: primary.organizationId,
        userId: alternate.userId,
        name: "削除対象ユーザー",
        email: "removal-target@example.com",
        emailNormalized: "removal-target@example.com",
        status: "active",
        createdAt: SCENARIO_NOW,
        updatedAt: SCENARIO_NOW,
      });
      const targetMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: primary.organizationId,
        personId: targetPersonId,
        userId: alternate.userId,
        status: "active",
        createdAt: SCENARIO_NOW,
        updatedAt: SCENARIO_NOW,
      });
      const targetStaffIds = await Promise.all(
        [primary.shopId, secondaryShopId].map((shopId) =>
          ctx.db.insert("staffs", {
            organizationId: primary.organizationId,
            organizationPersonId: targetPersonId,
            userId: alternate.userId,
            shopId,
            name: "削除対象ユーザー",
            email: "removal-target@example.com",
            emailNormalized: "removal-target@example.com",
            isDeleted: false,
          }),
        ),
      );
      const otherPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: primary.organizationId,
        name: "維持対象ユーザー",
        email: "removal-other@example.com",
        emailNormalized: "removal-other@example.com",
        status: "active",
        createdAt: SCENARIO_NOW,
        updatedAt: SCENARIO_NOW,
      });
      const otherStaffId = await ctx.db.insert("staffs", {
        organizationId: primary.organizationId,
        organizationPersonId: otherPersonId,
        shopId: primary.shopId,
        name: "維持対象ユーザー",
        email: "removal-other@example.com",
        emailNormalized: "removal-other@example.com",
        isDeleted: false,
      });
      const primaryPositionId = await ctx.db.insert("positions", {
        shopId: primary.shopId,
        name: "通常",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const secondaryPositionId = await ctx.db.insert("positions", {
        shopId: secondaryShopId,
        name: "通常",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const pastRecruitmentId = await seedRecruitment(ctx, {
        shopId: primary.shopId,
        periodStart: scenarioDate(-2),
        periodEnd: scenarioDate(-1),
        status: "confirmed",
      });
      const todayRecruitmentId = await seedRecruitment(ctx, {
        shopId: primary.shopId,
        periodStart: scenarioDate(0),
        periodEnd: scenarioDate(0),
        status: "open",
      });
      const futureRecruitmentId = await seedRecruitment(ctx, {
        shopId: secondaryShopId,
        periodStart: scenarioDate(1),
        periodEnd: scenarioDate(2),
        status: "confirmed",
      });
      const pastAssignmentId = await ctx.db.insert("shiftAssignments", {
        recruitmentId: pastRecruitmentId,
        staffId: targetStaffIds[0],
        date: scenarioDate(-1),
        startTime: "10:00",
        endTime: "18:00",
        positionId: primaryPositionId,
      });
      const todayAssignmentId = await ctx.db.insert("shiftAssignments", {
        recruitmentId: todayRecruitmentId,
        staffId: targetStaffIds[0],
        date: scenarioDate(0),
        startTime: "10:00",
        endTime: "18:00",
        positionId: primaryPositionId,
      });
      const futureAssignmentId = await ctx.db.insert("shiftAssignments", {
        recruitmentId: futureRecruitmentId,
        staffId: targetStaffIds[1],
        date: scenarioDate(1),
        startTime: "11:00",
        endTime: "19:00",
        positionId: secondaryPositionId,
      });
      const otherAssignmentId = await ctx.db.insert("shiftAssignments", {
        recruitmentId: todayRecruitmentId,
        staffId: otherStaffId,
        date: scenarioDate(0),
        startTime: "12:00",
        endTime: "20:00",
        positionId: primaryPositionId,
      });
      const sessionId = await ctx.db.insert("sessions", {
        sessionToken: "organization-removal-session",
        staffId: targetStaffIds[0],
        shopId: primary.shopId,
        recruitmentId: todayRecruitmentId,
        expiresAt: SCENARIO_NOW + 86_400_000,
      });
      const magicLinkId = await ctx.db.insert("magicLinks", {
        token: "organization-removal-magic-link",
        staffId: targetStaffIds[0],
        shopId: primary.shopId,
        recruitmentId: todayRecruitmentId,
        expiresAt: SCENARIO_NOW + 86_400_000,
      });
      const lineAccountId = await seedStaffLineAccount(ctx, {
        staffId: targetStaffIds[0],
        shopId: primary.shopId,
        lineUserId: "organization-removal-line-user",
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: primary.organizationId,
        email: "removal-target@example.com",
        emailNormalized: "removal-target@example.com",
        tokenDigest: "organization-removal-invitation",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: primary.memberId,
        targetPersonId,
        reservedSeat: false,
        version: 1,
        expiresAt: SCENARIO_NOW + 86_400_000,
        createdAt: SCENARIO_NOW,
        updatedAt: SCENARIO_NOW,
      });
      const outboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "organization-removal-outbox",
        organizationId: primary.organizationId,
        shopId: primary.shopId,
        staffId: targetStaffIds[0],
        userId: alternate.userId,
        purpose: "business",
        payload: {
          kind: "email",
          from: "noreply@example.com",
          to: "removal-target@example.com",
          subject: "削除前通知",
          html: "本文",
          context: "organization-removal-scenario",
        },
        attemptCount: 0,
        nextRunAt: SCENARIO_NOW,
        createdAt: SCENARIO_NOW,
        updatedAt: SCENARIO_NOW,
      });
      return {
        ...primary,
        alternate,
        targetPersonId,
        targetMemberId,
        targetStaffIds,
        pastRecruitmentId,
        todayRecruitmentId,
        futureRecruitmentId,
        pastAssignmentId,
        todayAssignmentId,
        futureAssignmentId,
        otherAssignmentId,
        sessionId,
        magicLinkId,
        lineAccountId,
        invitationId,
        outboxId,
      };
    });
    const manager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const targetActor = t.withIdentity({ subject: TARGET_SUBJECT });
    const detail = await manager.query(api.organization.userDetailQueries.getUserDetail, {
      shopId: ids.shopId,
      personId: ids.targetPersonId,
      now: SCENARIO_NOW,
    });
    expect(detail?.memberships).toHaveLength(2);
    expect(detail?.removalPreview).toMatchObject({ kind: "ready", assignmentCount: 2 });
    if (detail?.removalPreview.kind !== "ready") throw new Error("removal preview not ready");

    const requestId = "organization-person-removal-scenario";
    const mutationArgs = {
      shopId: ids.shopId,
      personId: ids.targetPersonId,
      requestId,
      removalPreview: {
        assignmentCount: detail.removalPreview.assignmentCount,
        fingerprint: detail.removalPreview.fingerprint,
      },
    };
    await expect(
      manager.mutation(api.organization.mutations.removePersonFromOrganization, mutationArgs),
    ).rejects.toThrow("先に管理者権限を外してください。");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.targetMemberId))?.status)).resolves.toBe("active");
    await expect(
      manager.mutation(api.organization.mutations.removeManagerRole, {
        shopId: ids.shopId,
        personId: ids.targetPersonId,
        requestId: "organization-person-removal-role",
      }),
    ).resolves.toEqual({ changed: true });
    await expect(
      manager.mutation(api.organization.mutations.removePersonFromOrganization, mutationArgs),
    ).resolves.toEqual({ changed: true });
    await expect(
      manager.mutation(api.organization.mutations.removePersonFromOrganization, mutationArgs),
    ).resolves.toEqual({ changed: false });

    const requestKey = await toAuditRequestKey(requestId);
    const state = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.targetPersonId),
      member: await ctx.db.get(ids.targetMemberId),
      staffs: await Promise.all(ids.targetStaffIds.map((staffId) => ctx.db.get(staffId))),
      pastAssignment: await ctx.db.get(ids.pastAssignmentId),
      todayAssignment: await ctx.db.get(ids.todayAssignmentId),
      futureAssignment: await ctx.db.get(ids.futureAssignmentId),
      otherAssignment: await ctx.db.get(ids.otherAssignmentId),
      recruitments: await Promise.all(
        [ids.pastRecruitmentId, ids.todayRecruitmentId, ids.futureRecruitmentId].map((id) => ctx.db.get(id)),
      ),
      session: await ctx.db.get(ids.sessionId),
      magicLink: await ctx.db.get(ids.magicLinkId),
      lineAccount: await ctx.db.get(ids.lineAccountId),
      invitation: await ctx.db.get(ids.invitationId),
      outbox: await ctx.db.get(ids.outboxId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq(
            "correlationId",
            `${ids.organizationId}:person-removal:organization:${ids.targetPersonId}:${requestKey}`,
          ),
        )
        .collect(),
    }));
    expect(state.person?.status).toBe("removed");
    expect(state.member?.status).toBe("removed");
    expect(state.staffs.every((staff) => staff?.isDeleted)).toBe(true);
    expect(state.pastAssignment).not.toBeNull();
    expect(state.todayAssignment).toBeNull();
    expect(state.futureAssignment).toBeNull();
    expect(state.otherAssignment).not.toBeNull();
    expect(state.recruitments.map((recruitment) => recruitment?.status)).toEqual(["confirmed", "open", "confirmed"]);
    expect(state.session?.revokedAt).toBe(SCENARIO_NOW);
    expect(state.magicLink?.revokedAt).toBe(SCENARIO_NOW);
    expect(state.lineAccount).toMatchObject({ isDeleted: true, following: false });
    expect(state.invitation).toMatchObject({ status: "revoked", reservedSeat: false });
    expect(state.outbox).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(state.audits).toHaveLength(1);

    const pastBoard = await manager.query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
      recruitmentId: ids.pastRecruitmentId,
      refreshDayKey: scenarioDate(0),
    });
    const currentBoard = await manager.query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
      recruitmentId: ids.todayRecruitmentId,
      refreshDayKey: scenarioDate(0),
    });
    expect(pastBoard?.staffs).toContainEqual(
      expect.objectContaining({ _id: ids.targetStaffIds[0], name: "削除対象ユーザー", isRemoved: true }),
    );
    expect(currentBoard?.staffs.map((staff) => staff._id)).not.toContain(ids.targetStaffIds[0]);

    await expect(targetActor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toBeNull();
    await expect(
      targetActor.query(api.organization.queries.getSettings, { shopId: ids.alternate.shopId }),
    ).resolves.toMatchObject({ organizationId: ids.alternate.organizationId });
  });
});
