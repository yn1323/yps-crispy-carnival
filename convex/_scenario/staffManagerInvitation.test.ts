import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { SCENARIO_NOW, type ScenarioTest, scenarioDate } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getLegalConsentVersions } from "../legal/documents";
import { deriveInvitationToken } from "../organizationInvitation/token";
import { getReminderTargetRef, sendReminderRef } from "../shopActivationReminder/refs";

const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";
const MANAGER_DIGEST_CONTEXTS = [
  "staffRegistration.sendOwnerDailyDigest",
  "shiftConfirmationReminder.sendManagerConfirmationReminder",
  "shopActivationReminder.sendReminder",
  "notificationOutbox.sendFailureReminderDigest",
] as const;
type ManagerDigestContext = (typeof MANAGER_DIGEST_CONTEXTS)[number];
const MANAGER_DIGEST_DEDUPE_MARKERS = [
  ":staffRegistrationDailyDigest:",
  ":shiftConfirmationReminder:",
  ":shopActivationReminder:",
  ":notificationFailureReminder:",
] as const;

describe("既存スタッフの管理者招待シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-line-channel");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("スタッフ詳細から招待した本人がログインすると同じ人物とスタッフのまま管理者になる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const owner = scenario.manager({ subject: "staff_invitation_owner", email: "owner@example.com" });
    const target = scenario.manager({
      subject: "staff_invitation_target",
      name: "招待対象スタッフ",
      email: "target@example.com",
      emailVerified: true,
    });

    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "staff_invitation_owner",
        email: "owner@example.com",
        shopName: "管理者招待テスト店舗",
        plan: "pro",
      }),
    );
    const [staffId] = await owner.addStaffs([{ name: "招待対象スタッフ", email: "target@example.com" }]);
    const before = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      if (!staff?.organizationPersonId) throw new Error("組織に紐づくスタッフが作成されていません");
      return {
        staff,
        person: await ctx.db.get(staff.organizationPersonId),
      };
    });
    if (!before.person) throw new Error("招待対象の人物が見つかりません");
    const personId = before.person._id;

    const created = await owner.inviteStaffAsManager(staffId);
    expect(created.status).toBe("issued");
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("管理者招待が見つかりません");
    expect(invitation).toMatchObject({
      organizationId: seeded.organizationId,
      targetPersonId: personId,
      status: "issued",
      purpose: "managerAddition",
    });

    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(target.acceptManagerInvitation(token, new Set(["target@example.com"]))).resolves.toEqual({
      status: "linked",
      organizationId: seeded.organizationId,
      shopId: seeded.shopId,
    });

    const state = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("emailNormalized", "target@example.com"),
        )
        .collect();
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("personId", personId),
        )
        .collect();
      return { staff, people, members };
    });
    expect(state.staff).toEqual(before.staff);
    expect(state.people).toHaveLength(1);
    expect(state.people[0]).toMatchObject({
      _id: personId,
      organizationId: seeded.organizationId,
      emailNormalized: "target@example.com",
      status: "active",
    });
    expect(state.people[0]?.userId).toBeDefined();
    expect(state.members).toHaveLength(1);
    expect(state.members[0]).toMatchObject({
      personId: before.person._id,
      userId: state.people[0]?.userId,
      status: "active",
    });

    const dashboardStaffs = await owner.getDashboardStaffs();
    expect(dashboardStaffs.page.find((staff) => staff._id === staffId)).toMatchObject({
      _id: staffId,
      isManager: true,
      isOrganizationLinked: true,
    });
  });

  it("管理者連携と権限解除に4種digestの宛先が追従し、スタッフ通知だけは維持する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const owner = scenario.manager({ subject: "digest_owner", email: "owner@example.com" });
    const target = scenario.manager({
      subject: "digest_target",
      name: "通知対象スタッフ",
      email: "target@example.com",
      emailVerified: true,
    });

    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "digest_owner",
        email: "owner@example.com",
        shopName: "複数管理者通知店舗",
        plan: "pro",
      });
      await ctx.db.insert("shopMembers", {
        shopId: organization.shopId,
        userId: organization.userId,
        role: "manager",
        isDeleted: false,
      });
      return organization;
    });
    const [staffId] = await owner.addStaffs([{ name: "通知対象スタッフ", email: "target@example.com" }]);
    const staffBeforeLink = await t.run((ctx) => ctx.db.get(staffId));
    if (!staffBeforeLink?.organizationPersonId) throw new Error("招待対象の人物が見つかりません");
    const personId = staffBeforeLink.organizationPersonId;

    const created = await owner.inviteStaffAsManager(staffId);
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("管理者招待が見つかりません");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(target.acceptManagerInvitation(token, new Set(["target@example.com"]))).resolves.toEqual({
      status: "linked",
      organizationId: seeded.organizationId,
      shopId: seeded.shopId,
    });
    const shiftContactEmail = "target-shift-contact@example.com";
    await owner.editStaff({ staffId, name: "通知対象スタッフ", email: shiftContactEmail });
    await owner.setShiftExclusion(staffId, true);
    const targetUserId = await t.run(async (ctx) => {
      const person = await ctx.db.get(personId);
      if (!person?.userId) throw new Error("連携した管理者ユーザーが見つかりません");
      const [user, staff] = await Promise.all([ctx.db.get(person.userId), ctx.db.get(staffId)]);
      expect(user?.email).toBe("target@example.com");
      expect(person.email).toBe(shiftContactEmail);
      expect(staff?.email).toBe(shiftContactEmail);
      return person.userId;
    });
    const recruitmentId = await owner.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("staffRegistrationRequests", {
        shopId: seeded.shopId,
        name: "承認待ちスタッフ",
        email: "pending-digest@example.com",
        emailNormalized: "pending-digest@example.com",
        status: "pending",
        ...getLegalConsentVersions("staff"),
        consentedAt: now,
        createdAt: now,
      });
      const failedDedupeKey = `email:recruitment:${recruitmentId}:${staffId}:manager-digest-fixture`;
      const failedOutboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: failedDedupeKey,
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        recruitmentId,
        staffId,
        purpose: "business",
        payload: {
          kind: "email",
          from: "scenario@shiftori.invalid",
          to: "target@example.com",
          subject: "通知失敗fixture",
          html: "<p>通知失敗fixture</p>",
          context: "notification.sendRecruitmentNotificationEmails",
          suppressDelivery: true,
        },
        attemptCount: 3,
        nextRunAt: now,
        lastError: "scenario notification failure",
        failedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("notificationFailureInbox", {
        failureKey: `outbox:${failedOutboxId}`,
        sourceType: "outbox",
        status: "open",
        shopId: seeded.shopId,
        recruitmentId,
        staffId,
        outboxId: failedOutboxId,
        channel: "email",
        dedupeKey: failedDedupeKey,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        firstFailedAt: now,
        lastFailedAt: now,
        attemptCount: 3,
        lastError: "scenario notification failure",
        createdAt: now,
        updatedAt: now,
      });
    });

    const managerUserIds = [seeded.userId, targetUserId].sort();
    await expect(readManagerDigestRecipientIds(t, seeded.shopId, recruitmentId)).resolves.toEqual({
      staffRegistration: managerUserIds,
      shiftConfirmation: managerUserIds,
      shopActivation: managerUserIds,
      failureReminder: managerUserIds,
    });

    await scheduleManagerDigests(t, seeded.shopId, recruitmentId);
    const activeManagerDigestOutbox = await readManagerDigestOutbox(t);
    expect(activeManagerDigestOutbox).toEqual(
      [
        ...expectedManagerDigestOutbox({
          shopId: seeded.shopId,
          recruitmentId,
          userId: seeded.userId,
          email: "owner@example.com",
          status: "pending",
        }),
        ...expectedManagerDigestOutbox({
          shopId: seeded.shopId,
          recruitmentId,
          userId: targetUserId,
          email: shiftContactEmail,
          status: "pending",
        }),
      ].sort(compareManagerDigestOutbox),
    );
    const staffNotificationBeforeRemoval = await readStaffNotificationOutbox(t, staffId);
    expect(staffNotificationBeforeRemoval).toEqual([
      {
        cancelReason: null,
        channel: "email",
        context: "line.sendInviteEmail",
        dedupeKey: `email:lineInvite:${staffId}`,
        payloadKind: "email",
        purpose: "business",
        staffId,
        status: "pending",
      },
    ]);

    await expect(owner.removeManagerRole(personId)).resolves.toEqual({ changed: true });
    await expect(readManagerDigestRecipientIds(t, seeded.shopId, recruitmentId)).resolves.toEqual({
      staffRegistration: [seeded.userId],
      shiftConfirmation: [seeded.userId],
      shopActivation: [seeded.userId],
      failureReminder: [seeded.userId],
    });
    await scheduleManagerDigests(t, seeded.shopId, recruitmentId);

    expect(await readManagerDigestOutbox(t)).toEqual(
      [
        ...expectedManagerDigestOutbox({
          shopId: seeded.shopId,
          recruitmentId,
          userId: seeded.userId,
          email: "owner@example.com",
          status: "pending",
        }),
        ...expectedManagerDigestOutbox({
          shopId: seeded.shopId,
          recruitmentId,
          userId: targetUserId,
          email: shiftContactEmail,
          status: "cancelled",
          cancelReason: "recipient_inactive",
        }),
      ].sort(compareManagerDigestOutbox),
    );
    await owner.setShiftExclusion(staffId, false);
    await expect(owner.sendOpenRecruitmentNotifications(staffId)).resolves.toEqual({ scheduled: true });
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    expect(await readStaffNotificationOutbox(t, staffId)).toEqual(staffNotificationBeforeRemoval);
    expect(await readOpenRecruitmentStaffNotificationOutbox(t, staffId, recruitmentId)).toEqual([
      {
        cancelReason: null,
        channel: "email",
        context: "notification.sendOpenRecruitmentNotificationsForStaff",
        dedupeKey: `email:manualRecruitment:${recruitmentId}:${staffId}:${SCENARIO_NOW}`,
        payloadKind: "email",
        purpose: "business",
        recruitmentId,
        staffId,
        status: "pending",
      },
    ]);

    const finalRoleState = await t.run(async (ctx) => {
      const [person, staff, members, legacyMemberships] = await Promise.all([
        ctx.db.get(personId),
        ctx.db.get(staffId),
        ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_personId", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("personId", personId),
          )
          .collect(),
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId", (q) => q.eq("userId", targetUserId).eq("shopId", seeded.shopId))
          .collect(),
      ]);
      return { person, staff, members, legacyMemberships };
    });
    expect(finalRoleState.person).toMatchObject({ _id: personId, status: "active", userId: targetUserId });
    expect(finalRoleState.staff).toMatchObject({
      _id: staffId,
      isDeleted: false,
      organizationPersonId: personId,
    });
    expect(finalRoleState.staff?.excludedFromShift).not.toBe(true);
    expect(finalRoleState.members).toEqual([expect.objectContaining({ status: "removed", userId: targetUserId })]);
    expect(finalRoleState.legacyMemberships).toEqual([]);
  });
});

async function scheduleManagerDigests(t: ScenarioTest, shopId: Id<"shops">, recruitmentId: Id<"recruitments">) {
  await t.run(async (ctx) => {
    await Promise.all([
      ctx.scheduler.runAfter(0, internal.staffRegistration.actions.sendOwnerDailyDigest, { shopId }),
      ctx.scheduler.runAfter(0, internal.shiftConfirmationReminder.actions.sendManagerConfirmationReminder, {
        recruitmentId,
      }),
      ctx.scheduler.runAfter(0, sendReminderRef, { shopId }),
      ctx.scheduler.runAfter(0, internal.notificationOutbox.failureReminderActions.sendFailureReminderDigest, {
        shopId,
      }),
    ]);
  });
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
}

async function readManagerDigestRecipientIds(t: ScenarioTest, shopId: Id<"shops">, recruitmentId: Id<"recruitments">) {
  const [staffRegistration, shiftConfirmation, shopActivation, failureReminder] = await Promise.all([
    t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, { shopId }),
    t.query(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, { recruitmentId }),
    t.query(getReminderTargetRef, { shopId }),
    t.query(internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop, { shopId }),
  ]);
  const ids = (recipients: Array<{ userId: Id<"users"> }> | undefined) =>
    recipients?.map(({ userId }) => userId).sort() ?? [];
  return {
    staffRegistration: ids(staffRegistration?.recipients),
    shiftConfirmation: ids(shiftConfirmation?.recipients),
    shopActivation: ids(shopActivation?.recipients),
    failureReminder: ids(failureReminder?.recipients),
  };
}

type ManagerDigestOutboxProjection = {
  cancelReason: Doc<"notificationOutbox">["cancelReason"] | null;
  channel: Doc<"notificationOutbox">["channel"];
  context: string | null;
  dedupeKey: string;
  email: string | null;
  payloadKind: Doc<"notificationOutbox">["payload"]["kind"];
  purpose: Doc<"notificationOutbox">["purpose"] | null;
  recruitmentId: Id<"recruitments"> | null;
  shopId: Id<"shops"> | null;
  staffId: Id<"staffs"> | null;
  status: Doc<"notificationOutbox">["status"];
  userId: Id<"users"> | null;
};

async function readManagerDigestOutbox(t: ScenarioTest): Promise<ManagerDigestOutboxProjection[]> {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.query("notificationOutbox").collect();
    return jobs
      .filter(isManagerDigestJob)
      .map((job) => ({
        cancelReason: job.cancelReason ?? null,
        channel: job.channel,
        context: notificationContextForProjection(job),
        dedupeKey: job.dedupeKey,
        email: notificationEmailForProjection(job),
        payloadKind: job.payload.kind,
        purpose: job.purpose ?? null,
        recruitmentId: job.recruitmentId ?? null,
        shopId: job.shopId ?? null,
        staffId: job.staffId ?? null,
        status: job.status,
        userId: job.userId ?? null,
      }))
      .sort(compareManagerDigestOutbox);
  });
}

function expectedManagerDigestOutbox(args: {
  shopId: Id<"shops">;
  recruitmentId: Id<"recruitments">;
  userId: Id<"users">;
  email: string;
  status: "pending" | "cancelled";
  cancelReason?: "recipient_inactive";
}): ManagerDigestOutboxProjection[] {
  const shared = {
    cancelReason: args.cancelReason ?? null,
    channel: "email" as const,
    email: args.email,
    payloadKind: "email" as const,
    purpose: "business" as const,
    shopId: args.shopId,
    staffId: null,
    status: args.status,
    userId: args.userId,
  };
  return [
    {
      ...shared,
      context: "staffRegistration.sendOwnerDailyDigest",
      dedupeKey: `email:staffRegistrationDailyDigest:${args.shopId}:${args.userId}`,
      recruitmentId: null,
    },
    {
      ...shared,
      context: "shiftConfirmationReminder.sendManagerConfirmationReminder",
      dedupeKey: `email:shiftConfirmationReminder:${args.recruitmentId}:${args.userId}`,
      recruitmentId: args.recruitmentId,
    },
    {
      ...shared,
      context: "shopActivationReminder.sendReminder",
      dedupeKey: `email:shopActivationReminder:${args.shopId}:${args.userId}`,
      recruitmentId: null,
    },
    {
      ...shared,
      context: "notificationOutbox.sendFailureReminderDigest",
      dedupeKey: `email:notificationFailureReminder:${args.shopId}:${args.userId}`,
      recruitmentId: null,
    },
  ];
}

function compareManagerDigestOutbox(left: ManagerDigestOutboxProjection, right: ManagerDigestOutboxProjection) {
  return `${left.context}:${left.userId}`.localeCompare(`${right.context}:${right.userId}`);
}

function isManagerDigestJob(job: Doc<"notificationOutbox">) {
  const context = notificationContextForProjection(job);
  return (
    MANAGER_DIGEST_CONTEXTS.includes(context as ManagerDigestContext) ||
    MANAGER_DIGEST_DEDUPE_MARKERS.some((marker) => job.dedupeKey.includes(marker))
  );
}

function notificationContextForProjection(job: Doc<"notificationOutbox">): string | null {
  if (job.payload.kind === "line") return job.payload.fallbackEmail?.payload.context ?? null;
  return job.payload.context;
}

function notificationEmailForProjection(job: Doc<"notificationOutbox">): string | null {
  if (job.payload.kind === "email" || job.payload.kind === "organizationManagerInvitationEmail") {
    return job.payload.to;
  }
  return job.payload.fallbackEmail?.payload.to ?? null;
}

async function readStaffNotificationOutbox(t: ScenarioTest, staffId: Id<"staffs">) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.query("notificationOutbox").collect();
    return jobs
      .filter(
        (job) =>
          job.staffId === staffId &&
          (notificationContextForProjection(job) === "line.sendInviteEmail" || job.dedupeKey.includes(":lineInvite:")),
      )
      .map((job) => ({
        cancelReason: job.cancelReason ?? null,
        channel: job.channel,
        context: notificationContextForProjection(job),
        dedupeKey: job.dedupeKey,
        payloadKind: job.payload.kind,
        purpose: job.purpose ?? null,
        staffId: job.staffId,
        status: job.status,
      }))
      .sort((left, right) => left.dedupeKey.localeCompare(right.dedupeKey));
  });
}

async function readOpenRecruitmentStaffNotificationOutbox(
  t: ScenarioTest,
  staffId: Id<"staffs">,
  recruitmentId: Id<"recruitments">,
) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.query("notificationOutbox").collect();
    return jobs
      .filter(
        (job) =>
          job.staffId === staffId &&
          job.recruitmentId === recruitmentId &&
          notificationContextForProjection(job) === "notification.sendOpenRecruitmentNotificationsForStaff",
      )
      .map((job) => ({
        cancelReason: job.cancelReason ?? null,
        channel: job.channel,
        context: notificationContextForProjection(job),
        dedupeKey: job.dedupeKey,
        payloadKind: job.payload.kind,
        purpose: job.purpose ?? null,
        recruitmentId: job.recruitmentId,
        staffId: job.staffId,
        status: job.status,
      }))
      .sort((left, right) => left.dedupeKey.localeCompare(right.dedupeKey));
  });
}
