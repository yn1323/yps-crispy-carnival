import { ConvexError } from "convex/values";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedStaffLineAccount, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { deriveInvitationToken, digestInvitationToken } from "./token";

const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";

async function seedActiveOrganizationStaff(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    subject: string;
    email?: string;
  },
) {
  const email = (args.email ?? `${args.subject}@example.com`).trim().toLowerCase();
  const userId = await seedUser(ctx, args.subject, email);
  const now = Date.now();
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    userId,
    name: `スタッフ ${args.subject}`,
    email,
    emailNormalized: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const staffId = await ctx.db.insert("staffs", {
    shopId: args.shopId,
    organizationId: args.organizationId,
    organizationPersonId: personId,
    userId,
    name: `スタッフ ${args.subject}`,
    email,
    emailNormalized: email,
    isDeleted: false,
  });
  return { userId, personId, staffId, email };
}

async function seedFullProWithReadOnlyNonStaff(ctx: MutationCtx, subject: string) {
  const manager = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
  for (let index = 0; index < 19; index += 1) {
    await seedActiveOrganizationStaff(ctx, {
      organizationId: manager.organizationId,
      shopId: manager.shopId,
      subject: `${subject}_staff_${index}`,
    });
  }
  const email = `${subject}_target@example.com`;
  const targetUserId = await seedUser(ctx, `${subject}_target`, email);
  const now = Date.now();
  const targetPersonId = await ctx.db.insert("organizationPeople", {
    organizationId: manager.organizationId,
    userId: targetUserId,
    name: "閲覧のみ人物",
    email,
    emailNormalized: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const targetMemberId = await ctx.db.insert("organizationMembers", {
    organizationId: manager.organizationId,
    personId: targetPersonId,
    userId: targetUserId,
    status: "readOnly",
    createdAt: now,
    updatedAt: now,
  });
  return { ...manager, targetUserId, targetPersonId, targetMemberId, targetEmail: email };
}

async function invitationSecurityState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    organizations: await ctx.db.query("organizations").collect(),
    people: await ctx.db.query("organizationPeople").collect(),
    members: await ctx.db.query("organizationMembers").collect(),
    invitations: await ctx.db.query("organizationInvitations").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

describe("organizationInvitation/mutations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00+09:00"));
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "enabled");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("ダークローンチ中は発行・再送・表示・受諾をすべて閉じ、副作用を残さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "closed_manager_invitation_owner",
        email: "closed-owner@example.com",
        plan: "pro",
      });
      const target = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "closed_manager_invitation_target",
        email: "closed-target@example.com",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "closed_manager_invitation_other",
        plan: "pro",
      });
      return { ...manager, target, other };
    });
    const owner = t.withIdentity({ subject: "closed_manager_invitation_owner", email: "closed-owner@example.com" });
    const created = await owner.mutation(api.organizationInvitation.mutations.createForPerson, {
      shopId: ids.shopId,
      personId: ids.target.personId,
      requestId: "closed-seed-invitation",
    });
    await t.finishInProgressScheduledFunctions();
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    const before = await invitationSecurityState(t);
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "");

    await expect(
      t
        .withIdentity({ subject: "closed_manager_invitation_other" })
        .mutation(api.organizationInvitation.mutations.create, {
          shopId: ids.shopId,
          email: "unauthorized-closed@example.com",
          requestId: "closed-unauthorized",
        }),
    ).rejects.toThrow("Not found");

    const unavailableMessage = "管理者の招待は現在ご利用いただけません";
    await expect(
      owner.mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.shopId,
        email: "closed-create@example.com",
        requestId: "closed-create",
      }),
    ).rejects.toThrow(unavailableMessage);
    await expect(
      owner.mutation(api.organizationInvitation.mutations.createExternal, {
        shopId: ids.shopId,
        name: "外部招待対象",
        email: "closed-external@example.com",
        requestId: "closed-create-external",
      }),
    ).rejects.toThrow(unavailableMessage);
    await expect(
      owner.mutation(api.organizationInvitation.mutations.createForPerson, {
        shopId: ids.shopId,
        personId: ids.target.personId,
        requestId: "closed-create-person",
      }),
    ).rejects.toThrow(unavailableMessage);
    await expect(
      owner.mutation(api.organizationInvitation.mutations.createForStaff, {
        shopId: ids.shopId,
        staffId: ids.target.staffId,
        requestId: "closed-create-staff",
      }),
    ).rejects.toThrow(unavailableMessage);
    await expect(
      owner.mutation(api.organizationInvitation.mutations.resend, {
        shopId: ids.shopId,
        invitationId: invitation._id,
        requestId: "closed-resend",
      }),
    ).rejects.toThrow(unavailableMessage);

    await expect(t.query(api.organizationInvitation.queries.getPreview, { token })).resolves.toEqual({
      status: "unavailable",
    });
    await expect(
      t.query(internal.organizationInvitation.queries.getEnqueueData, {
        invitationId: invitation._id,
        expectedVersion: invitation.version,
      }),
    ).resolves.toBeNull();
    const invitee = t.withIdentity({
      subject: "closed_manager_invitation_target",
      email: ids.target.email,
      emailVerified: true,
    });
    await expect(invitee.mutation(api.organizationInvitation.mutations.linkAccount, { token })).resolves.toEqual({
      status: "unavailable",
    });
    await expect(invitee.mutation(api.organizationInvitation.mutations.accept, { token })).resolves.toEqual({
      status: "unavailable",
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(invitee.mutation(api.organizationInvitation.mutations.linkAccount, { token })).resolves.toEqual({
        status: "unavailable",
      });
    }

    expect(await invitationSecurityState(t)).toEqual(before);

    // 閉状態の試行が冪等性・rate limit budgetを消費していないため、同じ要求を公開後に実行できる。
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "enabled");
    await expect(
      owner.mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.shopId,
        email: "closed-create@example.com",
        requestId: "closed-create",
      }),
    ).resolves.toMatchObject({ status: "created" });
    const resent = await owner.mutation(api.organizationInvitation.mutations.resend, {
      shopId: ids.shopId,
      invitationId: invitation._id,
      requestId: "closed-resend",
    });
    const resentInvitation = await t.run((ctx) => ctx.db.get(resent.invitationId));
    if (!resentInvitation) throw new Error("resent invitation not found");
    const resentToken = await deriveInvitationToken({
      invitationId: resentInvitation._id,
      version: resentInvitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      invitee.mutation(api.organizationInvitation.mutations.linkAccount, { token: resentToken }),
    ).resolves.toMatchObject({ status: "linked", organizationId: ids.organizationId });
  });

  it("ダークローンチ中も未使用招待の取消と期限処理は継続する", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "closed_invitation_cleanup_owner", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "closed_invitation_cleanup_owner" });
    const revoked = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "closed-revoke@example.com",
      requestId: "closed-revoke-create",
    });
    const expired = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "closed-expire@example.com",
      requestId: "closed-expire-create",
    });
    const expiringInvitation = await t.run((ctx) => ctx.db.get(expired.invitationId));
    if (!expiringInvitation) throw new Error("invitation not found");
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "");

    await expect(
      owner.mutation(api.organizationInvitation.mutations.revoke, {
        shopId: manager.shopId,
        invitationId: revoked.invitationId,
        requestId: "closed-revoke",
      }),
    ).resolves.toMatchObject({ status: "revoked", invitationId: revoked.invitationId });
    vi.setSystemTime(new Date(expiringInvitation.expiresAt + 1));
    await expect(
      t.mutation(internal.organizationInvitation.mutations.expire, {
        invitationId: expiringInvitation._id,
        expectedVersion: expiringInvitation.version,
        expectedExpiresAt: expiringInvitation.expiresAt,
      }),
    ).resolves.toEqual({ changed: true });
  });

  it("連携直後にダークローンチへ切り替えた場合は管理者連携完了通知をenqueueしない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "closed_acceptance_notification_owner",
        email: "closed-acceptance-owner@example.com",
        plan: "pro",
      }),
    );
    const created = await t
      .withIdentity({ subject: "closed_acceptance_notification_owner" })
      .mutation(api.organizationInvitation.mutations.createExternal, {
        shopId: manager.shopId,
        name: "連携通知対象",
        email: "closed-acceptance-target@example.com",
        requestId: "closed-acceptance-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      t
        .withIdentity({
          subject: "closed_acceptance_notification_target",
          email: "closed-acceptance-target@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toMatchObject({ status: "linked", organizationId: manager.organizationId });
    const scheduledAcceptanceJobs = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return jobs.filter((job) => job.name === "organizationInvitation/actions:enqueueAcceptanceNotifications");
    });
    expect(scheduledAcceptanceJobs.map((job) => ({ name: job.name, args: job.args[0] }))).toEqual([
      {
        name: "organizationInvitation/actions:enqueueAcceptanceNotifications",
        args: {
          invitationId: invitation._id,
          expectedVersion: invitation.version + 1,
          organizationBillingVersionAtOrigin: 1,
        },
      },
    ]);
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "");

    await t.finishInProgressScheduledFunctions();

    const acceptanceJobs = await t.run(async (ctx) => {
      const jobs = await ctx.db.query("notificationOutbox").collect();
      return jobs.filter(
        (job) => job.payload.kind === "email" && job.payload.context === "organizationInvitation.linked",
      );
    });
    expect(acceptanceJobs).toEqual([]);
  });

  it("発行時は人物を作らず、確認済みメールの本人がアカウント連携した時だけ管理者にする", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "example.com");
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "invite_owner", email: "owner@example.com", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "invite_owner", email: "owner@example.com" });

    const created = await owner.mutation(api.organizationInvitation.mutations.createExternal, {
      shopId: manager.shopId,
      name: "招待 太郎",
      email: " Invitee@Example.com ",
      requestId: "create-1",
    });
    await t.finishInProgressScheduledFunctions();
    const repeated = await owner.mutation(api.organizationInvitation.mutations.createExternal, {
      shopId: manager.shopId,
      name: "招待 太郎",
      email: "invitee@example.com",
      requestId: "create-2",
    });
    expect(created.status).toBe("issued");
    expect(repeated.status).toBe("issued");
    expect(repeated.invitationId).not.toBe(created.invitationId);

    const stateAfterResend = await t.run(async (ctx) => ({
      first: await ctx.db.get(created.invitationId),
      second: await ctx.db.get(repeated.invitationId),
    }));
    expect(stateAfterResend.first).toMatchObject({ status: "revoked", reservedSeat: false, version: 2 });
    const invitation = stateAfterResend.second;
    if (!invitation) throw new Error("invitation not found");
    expect(invitation).toMatchObject({
      organizationId: manager.organizationId,
      invitedName: "招待 太郎",
      emailNormalized: "invitee@example.com",
      status: "issued",
      reservedSeat: true,
      version: 1,
      predecessorInvitationId: created.invitationId,
    });
    const stateBeforeLink = await t.run(async (ctx) => ({
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", manager.organizationId).eq("emailNormalized", "invitee@example.com"),
        )
        .collect(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", manager.organizationId).eq("status", "active"),
        )
        .collect(),
    }));
    expect(stateBeforeLink.people).toEqual([]);
    expect(stateBeforeLink.members).toHaveLength(1);
    expect(invitation.tokenDigest).not.toContain("invitee@example.com");
    const firstToken = await deriveInvitationToken({
      invitationId: created.invitationId,
      version: 1,
      signingSecret: SIGNING_SECRET,
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: firstToken })).resolves.toEqual({
      status: "revoked",
    });
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token })).resolves.toMatchObject({
      status: "ready",
      organizationName: "テスト店舗事業者",
    });

    await expect(
      t
        .withIdentity({ subject: "invitee_unverified", email: "invitee@example.com", emailVerified: false })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toEqual({ status: "emailMismatch" });
    await expect(
      t
        .withIdentity({ subject: "invitee_missing_claim", email: "invitee@example.com" })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toEqual({ status: "emailMismatch" });
    await expect(
      t
        .withIdentity({ subject: "invitee_wrong", email: "wrong@example.com", emailVerified: true })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toEqual({ status: "emailMismatch" });

    const linked = await t
      .withIdentity({ subject: "invitee", email: "invitee@example.com", emailVerified: true, name: "招待 太郎" })
      .mutation(api.organizationInvitation.mutations.linkAccount, { token });
    expect(linked).toEqual({
      status: "linked",
      organizationId: manager.organizationId,
      shopId: manager.shopId,
    });
    await expect(
      t
        .withIdentity({ subject: "invitee", email: "invitee@example.com", emailVerified: true })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toEqual({ status: "linked", organizationId: manager.organizationId, shopId: manager.shopId });

    const result = await t.run(async (ctx) => {
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", manager.organizationId).eq("emailNormalized", "invitee@example.com"),
        )
        .collect();
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", manager.organizationId).eq("personId", people[0]?._id),
        )
        .collect();
      const acceptedInvitation = await ctx.db.get(invitation._id);
      return { people, members, acceptedInvitation };
    });
    expect(result.people).toHaveLength(1);
    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.status).toBe("active");
    expect(result.acceptedInvitation).toMatchObject({ status: "linked", reservedSeat: false });
    await expect(
      t.action(internal.organizationInvitation.actions.enqueueAcceptanceNotifications, {
        invitationId: invitation._id,
        expectedVersion: invitation.version + 1,
        organizationBillingVersionAtOrigin: 1,
      }),
    ).resolves.toEqual({ enqueuedCount: 2 });
    const acceptanceJobs = await t.run((ctx) =>
      ctx.db
        .query("notificationOutbox")
        .collect()
        .then((jobs) =>
          jobs.filter((job) => job.payload.kind === "email" && job.payload.context === "organizationInvitation.linked"),
        ),
    );
    expect(acceptanceJobs).toHaveLength(2);
    expect(acceptanceJobs.every((job) => job.channel === "email" && job.purpose === "business")).toBe(true);
    expect(acceptanceJobs.every((job) => job.payload.suppressDelivery === true)).toBe(true);
    for (const job of acceptanceJobs) {
      if (job.payload.kind !== "email") throw new Error("email payload expected");
      const actionUrl = extractOrganizationSettingsActionUrl(job.payload.html);
      expect(actionUrl.pathname).toBe("/settings");
      expect([...actionUrl.searchParams.entries()]).toEqual([["shop", manager.shopId]]);
    }
  });

  it("アカウント削除受付済みユーザーは招待から人物・管理者所属へ再関連付けできない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "requested_invite_owner",
        email: "requested-invite-owner@example.com",
        plan: "pro",
      });
      const targetUserId = await seedUser(ctx, "requested_invitee", "requested-invitee@example.com");
      await ctx.db.patch(targetUserId, { accountDeletionRequestedAt: Date.now() });
      return { manager, targetUserId };
    });
    const created = await t
      .withIdentity({ subject: "requested_invite_owner", email: "requested-invite-owner@example.com" })
      .mutation(api.organizationInvitation.mutations.createExternal, {
        shopId: seeded.manager.shopId,
        name: "削除受付済み招待者",
        email: "requested-invitee@example.com",
        requestId: "requested-invite-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });

    await expect(
      t
        .withIdentity({
          subject: "requested_invitee",
          email: "requested-invitee@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toEqual({ status: "unavailable" });

    const state = await t.run(async (ctx) => ({
      invitation: await ctx.db.get(invitation._id),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", seeded.manager.organizationId).eq("emailNormalized", "requested-invitee@example.com"),
        )
        .collect(),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", seeded.targetUserId).eq("organizationId", seeded.manager.organizationId),
        )
        .collect(),
      legacyMemberships: await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) =>
          q.eq("userId", seeded.targetUserId).eq("shopId", seeded.manager.shopId),
        )
        .collect(),
    }));
    expect(state.invitation).toMatchObject({ status: "issued", reservedSeat: true, version: 1 });
    expect(state.people).toEqual([]);
    expect(state.members).toEqual([]);
    expect(state.legacyMemberships).toEqual([]);
  });

  it.each([
    {
      caseKey: "plan_suspended",
      label: "プラン停止中",
      initialStatus: "planSuspended" as const,
      removal: null,
      expectsShop: true,
    },
    {
      caseKey: "archived",
      label: "アーカイブ",
      initialStatus: "archived" as const,
      removal: null,
      expectsShop: true,
    },
    {
      caseKey: "deleted",
      label: "削除済み",
      initialStatus: "active" as const,
      removal: "logical" as const,
      expectsShop: false,
    },
    {
      caseKey: "missing",
      label: "店舗なし",
      initialStatus: "active" as const,
      removal: "physical" as const,
      expectsShop: false,
    },
  ])("連携完了CTAは$label店舗の安全な設定URLを使う", async ({ caseKey, initialStatus, removal, expectsShop }) => {
    const t = convexTest(schema, modules);
    const subject = `acceptance_cta_${caseKey}`;
    const targetEmail = `${subject}_target@example.com`;
    const manager = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
      if (initialStatus !== "active") await ctx.db.patch(seeded.shopId, { operatingStatus: initialStatus });
      return seeded;
    });
    const created = await t.withIdentity({ subject }).mutation(api.organizationInvitation.mutations.createExternal, {
      shopId: manager.shopId,
      name: "招待対象",
      email: targetEmail,
      requestId: `acceptance-cta-${caseKey}`,
    });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      t
        .withIdentity({ subject: `${subject}_target`, email: targetEmail, emailVerified: true })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toMatchObject({ status: "linked", organizationId: manager.organizationId, shopId: manager.shopId });

    if (removal) {
      await t.run(async (ctx) => {
        if (removal === "logical") await ctx.db.patch(manager.shopId, { isDeleted: true });
        else await ctx.db.delete(manager.shopId);
      });
    }
    await expect(
      t.action(internal.organizationInvitation.actions.enqueueAcceptanceNotifications, {
        invitationId: invitation._id,
        expectedVersion: invitation.version + 1,
      }),
    ).resolves.toEqual({ enqueuedCount: 2 });
    const acceptanceHtml = await t.run(async (ctx) => {
      const jobs = await ctx.db.query("notificationOutbox").collect();
      return jobs.flatMap((job) =>
        job.payload.kind === "email" && job.payload.context === "organizationInvitation.linked"
          ? [job.payload.html]
          : [],
      );
    });
    expect(acceptanceHtml).toHaveLength(2);
    for (const html of acceptanceHtml) {
      const actionUrl = extractOrganizationSettingsActionUrl(html);
      expect(actionUrl.pathname).toBe("/settings");
      expect([...actionUrl.searchParams.entries()]).toEqual(expectsShop ? [["shop", manager.shopId]] : []);
    }
  });

  it("別グループに存在する利用者へは人物を事前作成せず、ログイン後に既存利用者を再利用する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const existing = await seedOrganizationManagerShop(ctx, {
        subject: "existing_invitee",
        email: "existing-invitee@example.com",
        shopName: "既存グループ店舗",
        plan: "pro",
      });
      const owner = await seedOrganizationManagerShop(ctx, {
        subject: "existing_invitee_owner",
        shopName: "招待元店舗",
        plan: "pro",
      });
      return { existing, owner };
    });

    const created = await t
      .withIdentity({ subject: "existing_invitee_owner" })
      .mutation(api.organizationInvitation.mutations.createExternal, {
        shopId: ids.owner.shopId,
        name: "既存 利用者",
        email: "existing-invitee@example.com",
        requestId: "existing-user-invitation",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");

    const beforeLink = await t.run(async (ctx) =>
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", ids.owner.organizationId).eq("emailNormalized", "existing-invitee@example.com"),
        )
        .collect(),
    );
    expect(beforeLink).toEqual([]);

    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      t
        .withIdentity({
          subject: "existing_invitee",
          email: "existing-invitee@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.linkAccount, { token }),
    ).resolves.toEqual({
      status: "linked",
      organizationId: ids.owner.organizationId,
      shopId: ids.owner.shopId,
    });

    const linked = await t.run(async (ctx) => {
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", ids.owner.organizationId).eq("userId", ids.existing.userId),
        )
        .collect();
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", ids.owner.organizationId).eq("personId", people[0]?._id),
        )
        .collect();
      const users = await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", "https://convex.test|existing_invitee"))
        .collect();
      return { people, members, users };
    });
    expect(linked.users).toHaveLength(1);
    expect(linked.users[0]?._id).toBe(ids.existing.userId);
    expect(linked.people).toHaveLength(1);
    expect(linked.people[0]?.userId).toBe(ids.existing.userId);
    expect(linked.members).toHaveLength(1);
    expect(linked.members[0]).toMatchObject({ userId: ids.existing.userId, status: "active" });
  });

  it("同じメールへの並行招待でもpending招待と予約枠を一件だけ作る", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "parallel_invite_owner", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "parallel_invite_owner" });

    const results = await Promise.all([
      owner.mutation(api.organizationInvitation.mutations.create, {
        shopId: manager.shopId,
        email: "parallel@example.com",
        requestId: "parallel-create-a",
      }),
      owner.mutation(api.organizationInvitation.mutations.create, {
        shopId: manager.shopId,
        email: "parallel@example.com",
        requestId: "parallel-create-b",
      }),
    ]);

    expect(results.filter((result) => result.status === "created")).toHaveLength(1);
    expect(results.filter((result) => result.status === "alreadyPending")).toHaveLength(1);
    const invitations = await t.run((ctx) =>
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
          q
            .eq("organizationId", manager.organizationId)
            .eq("emailNormalized", "parallel@example.com")
            .eq("status", "issued"),
        )
        .collect(),
    );
    expect(invitations).toHaveLength(1);
    expect(invitations[0]?.reservedSeat).toBe(true);
  });

  it("スタッフIDで対象人物を固定し、メール変更後は古い招待を失効して現在メールへ付け替える", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "staff_invite_owner",
        plan: "pro",
      });
      const target = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "staff_invite_target",
        email: "staff-target-before@example.com",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "staff_invite_other_owner",
        plan: "pro",
      });
      const otherTarget = await seedActiveOrganizationStaff(ctx, {
        organizationId: other.organizationId,
        shopId: other.shopId,
        subject: "staff_invite_other_target",
      });
      return { ...manager, target, otherTarget };
    });
    const owner = t.withIdentity({ subject: "staff_invite_owner" });

    await expect(
      owner.mutation(api.organizationInvitation.mutations.createForStaff, {
        shopId: ids.shopId,
        staffId: ids.otherTarget.staffId,
        requestId: "staff-target-cross-shop",
      }),
    ).rejects.toThrow("Not found");

    const first = await owner.mutation(api.organizationInvitation.mutations.createForStaff, {
      shopId: ids.shopId,
      staffId: ids.target.staffId,
      requestId: "staff-target-first",
    });
    const firstInvitation = await t.run((ctx) => ctx.db.get(first.invitationId));
    if (!firstInvitation) throw new Error("invitation not found");
    expect(firstInvitation).toMatchObject({
      targetPersonId: ids.target.personId,
      emailNormalized: "staff-target-before@example.com",
      purpose: "managerAddition",
      reservedSeat: false,
      status: "issued",
    });
    const firstToken = await deriveInvitationToken({
      invitationId: firstInvitation._id,
      version: firstInvitation.version,
      signingSecret: SIGNING_SECRET,
    });

    await owner.mutation(api.staff.mutations.editStaff, {
      shopId: ids.shopId,
      staffId: ids.target.staffId,
      name: "現在メールのスタッフ",
      email: "staff-target-after@example.com",
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: firstToken })).resolves.toEqual({
      status: "unavailable",
    });

    const second = await owner.mutation(api.organizationInvitation.mutations.createForStaff, {
      shopId: ids.shopId,
      staffId: ids.target.staffId,
      requestId: "staff-target-second",
    });
    const state = await t.run(async (ctx) => ({
      first: await ctx.db.get(first.invitationId),
      second: await ctx.db.get(second.invitationId),
    }));
    expect(state.first).toMatchObject({ status: "revoked", reservedSeat: false });
    expect(state.second).toMatchObject({
      targetPersonId: ids.target.personId,
      predecessorInvitationId: first.invitationId,
      emailNormalized: "staff-target-after@example.com",
      status: "issued",
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: firstToken })).resolves.toEqual({
      status: "revoked",
    });

    if (!state.second) throw new Error("replacement invitation not found");
    const secondToken = await deriveInvitationToken({
      invitationId: state.second._id,
      version: state.second.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      t
        .withIdentity({
          subject: "staff_invite_target",
          email: "staff-target-after@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.accept, { token: secondToken }),
    ).resolves.toMatchObject({ status: "accepted", organizationId: ids.organizationId });
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_personId", (q) =>
            q.eq("organizationId", ids.organizationId).eq("personId", ids.target.personId),
          )
          .unique(),
      ),
    ).resolves.toMatchObject({ status: "active" });
  });

  it("同じ人物への再送は旧URLを失効し、連携前の管理者所属を作らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, { subject: "person_resend_owner", plan: "pro" });
      const target = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "person_resend_target",
      });
      return { ...manager, target };
    });
    const owner = t.withIdentity({ subject: "person_resend_owner" });

    const first = await owner.mutation(api.organizationInvitation.mutations.createForPerson, {
      shopId: ids.shopId,
      personId: ids.target.personId,
      requestId: "person-resend-first",
    });
    const firstInvitation = await t.run((ctx) => ctx.db.get(first.invitationId));
    if (!firstInvitation) throw new Error("invitation not found");
    const firstToken = await deriveInvitationToken({
      invitationId: firstInvitation._id,
      version: firstInvitation.version,
      signingSecret: SIGNING_SECRET,
    });

    const second = await owner.mutation(api.organizationInvitation.mutations.createForPerson, {
      shopId: ids.shopId,
      personId: ids.target.personId,
      requestId: "person-resend-second",
    });
    const state = await t.run(async (ctx) => ({
      first: await ctx.db.get(first.invitationId),
      second: await ctx.db.get(second.invitationId),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", ids.organizationId).eq("personId", ids.target.personId),
        )
        .collect(),
    }));
    expect(second.invitationId).not.toBe(first.invitationId);
    expect(state.first).toMatchObject({ status: "revoked", reservedSeat: false, version: 2 });
    expect(state.second).toMatchObject({
      status: "issued",
      predecessorInvitationId: first.invitationId,
      targetPersonId: ids.target.personId,
    });
    expect(state.members).toEqual([]);
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: firstToken })).resolves.toEqual({
      status: "revoked",
    });
    if (!state.second) throw new Error("replacement invitation not found");
    const secondToken = await deriveInvitationToken({
      invitationId: state.second._id,
      version: state.second.version,
      signingSecret: SIGNING_SECRET,
    });
    expect(secondToken).not.toBe(firstToken);
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: secondToken })).resolves.toMatchObject(
      {
        status: "ready",
      },
    );
  });

  it("LINE連携済みの既存人物にも生トークンを保存せずメール招待を予約する", async () => {
    vi.stubEnv("NOTIFICATION_DRY_RUN_USER_EMAILS", "example.com");
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, { subject: "person_line_invite_owner", plan: "pro" });
      const target = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "person_line_invite_target",
      });
      await seedStaffLineAccount(ctx, {
        staffId: target.staffId,
        shopId: manager.shopId,
        lineUserId: "U_person_line_invite",
      });
      return { ...manager, target };
    });
    const created = await t
      .withIdentity({ subject: "person_line_invite_owner" })
      .mutation(api.organizationInvitation.mutations.createForPerson, {
        shopId: ids.shopId,
        personId: ids.target.personId,
        requestId: "person-line-invite",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");

    await expect(
      t.action(internal.organizationInvitation.actions.enqueueManagerInvitation, {
        invitationId: invitation._id,
        expectedVersion: invitation.version,
        organizationBillingVersionAtOrigin: 1,
      }),
    ).resolves.toEqual({ enqueued: true });
    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      channel: "email",
      organizationInvitationId: invitation._id,
      organizationInvitationVersion: invitation.version,
      payload: {
        kind: "organizationManagerInvitationEmail",
        to: ids.target.email,
        context: "organizationInvitation.enqueueManagerInvitation",
        suppressDelivery: true,
      },
    });
    expect(JSON.stringify(jobs[0])).not.toContain("/manager-invite?token=");
  });

  it("別スタッフへの並行招待でも有効管理者と追加招待を合計5枠までにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "manager_reservation_owner",
        plan: "pro",
      });
      const targets = [];
      for (let index = 0; index < 5; index += 1) {
        targets.push(
          await seedActiveOrganizationStaff(ctx, {
            organizationId: manager.organizationId,
            shopId: manager.shopId,
            subject: `manager_reservation_target_${index}`,
          }),
        );
      }
      return { ...manager, targets };
    });
    const owner = t.withIdentity({ subject: "manager_reservation_owner" });

    const results = await Promise.allSettled(
      ids.targets.map((target, index) =>
        owner.mutation(api.organizationInvitation.mutations.createForStaff, {
          shopId: ids.shopId,
          staffId: target.staffId,
          requestId: `manager-reservation-${index}`,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(String(results.find((result) => result.status === "rejected")?.reason)).toContain(
      "招待中を含めた管理者の合計が、現在のプラン上限を超えます。",
    );
    const pending = await t.run((ctx) =>
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("status", "issued"),
        )
        .collect(),
    );
    expect(pending).toHaveLength(4);
    expect(new Set(pending.map((invitation) => invitation.targetPersonId)).size).toBe(4);
  });

  it("管理者招待の短時間再作成を拒否し、一分後だけ新しい招待を発行する", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "create_rate_limit_owner", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "create_rate_limit_owner" });
    const first = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "create-limit@example.com",
      requestId: "create-rate-limit-first",
    });
    await t.run(async (ctx) =>
      ctx.db.patch(first.invitationId, {
        status: "revoked",
        reservedSeat: false,
        revokedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      owner.mutation(api.organizationInvitation.mutations.create, {
        shopId: manager.shopId,
        email: "create-limit@example.com",
        requestId: "create-rate-limit-second",
      }),
    ).rejects.toThrow("招待回数が多いため");
    expect(await t.run((ctx) => ctx.db.query("organizationInvitations").collect())).toHaveLength(1);

    vi.setSystemTime(new Date(Date.now() + 60_000));
    await expect(
      owner.mutation(api.organizationInvitation.mutations.create, {
        shopId: manager.shopId,
        email: "create-limit@example.com",
        requestId: "create-rate-limit-after-refill",
      }),
    ).resolves.toMatchObject({ status: "created" });
    expect(await t.run((ctx) => ctx.db.query("organizationInvitations").collect())).toHaveLength(2);
  });

  it("管理者招待の短時間再送を拒否し、新しい招待を重複発行しない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "resend_rate_limit_owner", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "resend_rate_limit_owner" });
    const first = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "resend-limit@example.com",
      requestId: "resend-rate-limit-create",
    });
    const resent = await owner.mutation(api.organizationInvitation.mutations.resend, {
      shopId: manager.shopId,
      invitationId: first.invitationId,
      requestId: "resend-rate-limit-first",
    });

    await expect(
      owner.mutation(api.organizationInvitation.mutations.resend, {
        shopId: manager.shopId,
        invitationId: resent.invitationId,
        requestId: "resend-rate-limit-second",
      }),
    ).rejects.toThrow("少し時間をおいて");
    const invitations = await t.run((ctx) => ctx.db.query("organizationInvitations").collect());
    expect(invitations).toHaveLength(2);
    expect(invitations.filter((invitation) => invitation.status === "issued")).toHaveLength(1);
  });

  it("短時間上限で拒否した試行は日次再送枠を消費しない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "resend_short_limit_owner", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "resend_short_limit_owner" });
    const first = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "resend-short-limit@example.com",
      requestId: "resend-short-limit-create",
    });
    const resent = await owner.mutation(api.organizationInvitation.mutations.resend, {
      shopId: manager.shopId,
      invitationId: first.invitationId,
      requestId: "resend-short-limit-first",
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        owner.mutation(api.organizationInvitation.mutations.resend, {
          shopId: manager.shopId,
          invitationId: resent.invitationId,
          requestId: `resend-short-limit-rejected-${attempt}`,
        }),
      ).rejects.toThrow("少し時間をおいて");
    }

    vi.setSystemTime(new Date(Date.now() + 60_000));
    await expect(
      owner.mutation(api.organizationInvitation.mutations.resend, {
        shopId: manager.shopId,
        invitationId: resent.invitationId,
        requestId: "resend-short-limit-after-refill",
      }),
    ).resolves.toMatchObject({ status: "created" });
  });

  it("再送入口を切り替えて1分ずつ待っても日次上限を超えず、拒否時に業務状態を変えない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "resend_daily_limit_owner", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "resend_daily_limit_owner" });
    const email = "resend-daily-limit@example.com";
    const first = await owner.mutation(api.organizationInvitation.mutations.createExternal, {
      shopId: manager.shopId,
      name: "日次上限対象",
      email,
      requestId: "resend-daily-limit-create",
    });
    let invitationId = first.invitationId;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      vi.setSystemTime(new Date(Date.now() + 60_000));
      if (attempt % 2 === 0) {
        const result = await owner.mutation(api.organizationInvitation.mutations.createExternal, {
          shopId: manager.shopId,
          name: "日次上限対象",
          email,
          requestId: `resend-daily-limit-reissue-${attempt}`,
        });
        expect(result.status).toBe("issued");
        invitationId = result.invitationId;
      } else {
        const result = await owner.mutation(api.organizationInvitation.mutations.resend, {
          shopId: manager.shopId,
          invitationId,
          requestId: `resend-daily-limit-direct-${attempt}`,
        });
        expect(result.status).toBe("created");
        invitationId = result.invitationId;
      }
    }

    vi.setSystemTime(new Date(Date.now() + 60_000));
    const beforeRejected = await invitationSecurityState(t);
    await expect(
      owner.mutation(api.organizationInvitation.mutations.resend, {
        shopId: manager.shopId,
        invitationId,
        requestId: "resend-daily-limit-rejected",
      }),
    ).rejects.toThrow("招待回数が多いため");
    expect(await invitationSecurityState(t)).toEqual(beforeRejected);
  });

  it("管理者招待の承認は同じtokenの6回目をrate limitし、回復後も所属を重複作成しない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "accept_rate_limit_owner", plan: "pro" }),
    );
    const created = await t
      .withIdentity({ subject: "accept_rate_limit_owner" })
      .mutation(api.organizationInvitation.mutations.create, {
        shopId: manager.shopId,
        email: "accept-limit@example.com",
        requestId: "accept-rate-limit-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    const invitee = t.withIdentity({
      subject: "accept_rate_limit_target",
      email: "accept-limit@example.com",
      emailVerified: true,
    });

    await expect(invitee.mutation(api.organizationInvitation.mutations.accept, { token })).resolves.toMatchObject({
      status: "accepted",
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(invitee.mutation(api.organizationInvitation.mutations.accept, { token })).resolves.toEqual({
        status: "used",
      });
    }
    await expect(invitee.mutation(api.organizationInvitation.mutations.accept, { token })).resolves.toEqual({
      status: "unavailable",
    });

    vi.setSystemTime(new Date(Date.now() + 60_000));
    await expect(invitee.mutation(api.organizationInvitation.mutations.accept, { token })).resolves.toEqual({
      status: "used",
    });
    const targetPeople = await t.run((ctx) =>
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", manager.organizationId).eq("emailNormalized", "accept-limit@example.com"),
        )
        .collect(),
    );
    expect(targetPeople).toHaveLength(1);
    const targetMembers = await t.run((ctx) =>
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", manager.organizationId).eq("personId", targetPeople[0]?._id),
        )
        .collect(),
    );
    expect(targetMembers).toHaveLength(1);
  });

  it("異なる不正tokenでも認証主体の試行上限を共有し、別主体の正当な承認を妨げない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "stable_accept_limit_owner", plan: "pro" }),
    );
    const created = await t
      .withIdentity({ subject: "stable_accept_limit_owner" })
      .mutation(api.organizationInvitation.mutations.create, {
        shopId: manager.shopId,
        email: "stable-accept-target@example.com",
        requestId: "stable-accept-limit-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const validToken = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    const attacker = t.withIdentity({
      subject: "stable_accept_limit_attacker",
      email: "attacker@example.com",
      emailVerified: true,
    });
    const beforeAttacks = await invitationSecurityState(t);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalidToken = `${attempt}`.padStart(43, "x");
      await expect(
        attacker.mutation(api.organizationInvitation.mutations.accept, { token: invalidToken }),
      ).resolves.toEqual({ status: "invalid" });
    }
    await expect(
      attacker.mutation(api.organizationInvitation.mutations.accept, { token: "blocked".padStart(43, "x") }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(await invitationSecurityState(t)).toEqual(beforeAttacks);

    await expect(
      t
        .withIdentity({
          subject: "stable_accept_limit_target",
          email: "stable-accept-target@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.accept, { token: validToken }),
    ).resolves.toMatchObject({ status: "accepted", organizationId: manager.organizationId });
  });

  it("BusinessからProへの変更予約中も適用日まではBusiness上限で管理者招待を作成する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "scheduled_pro_invite_owner",
        plan: "business",
      });
      for (let index = 0; index < 29; index += 1) {
        await seedActiveOrganizationStaff(ctx, {
          organizationId: manager.organizationId,
          shopId: manager.shopId,
          subject: `scheduled_pro_invite_staff_${index}`,
        });
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", manager.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "scheduledChange",
          currentPlan: "business",
          targetPlan: "pro",
          effectiveAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
      });
      return manager;
    });

    await expect(
      t.withIdentity({ subject: "scheduled_pro_invite_owner" }).mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.shopId,
        email: "scheduled-pro-new-manager@example.com",
        requestId: "scheduled-pro-invite-create",
      }),
    ).resolves.toMatchObject({ status: "created", invitationId: expect.any(String) });

    const invitations = await t.run((ctx) =>
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    );
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({
      emailNormalized: "scheduled-pro-new-manager@example.com",
      status: "issued",
      reservedSeat: true,
    });
  });

  it("利用人数に未算入のreadOnly人物を管理者へ戻す招待でも空きを予約する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedFullProWithReadOnlyNonStaff(ctx, "readonly_invite_create"));

    await expect(
      t.withIdentity({ subject: "readonly_invite_create" }).mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.shopId,
        email: ids.targetEmail,
        requestId: "readonly-invite-create",
      }),
    ).rejects.toThrow("利用人数が現在のプラン上限を超えます。\n現在20名、上限20名です。");

    const invitations = await t.run((ctx) =>
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("emailNormalized", ids.targetEmail).eq("status", "pending"),
        )
        .collect(),
    );
    expect(invitations).toEqual([]);
  });

  it("期限切れ招待の再送でもreadOnly非staff人物の人数増分を再検証する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedFullProWithReadOnlyNonStaff(ctx, "readonly_invite_resend");
      const now = Date.now();
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: base.targetEmail,
        emailNormalized: base.targetEmail,
        tokenDigest: "expired-readonly-invitation",
        status: "expired",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now - 1,
        expiredAt: now - 1,
        createdAt: now - 1_000,
        updatedAt: now - 1,
      });
      return { ...base, invitationId };
    });

    await expect(
      t.withIdentity({ subject: "readonly_invite_resend" }).mutation(api.organizationInvitation.mutations.resend, {
        shopId: ids.shopId,
        invitationId: ids.invitationId,
        requestId: "readonly-invite-resend",
      }),
    ).rejects.toThrow("利用人数が現在のプラン上限を超えます");
    await expect(t.run((ctx) => ctx.db.get(ids.invitationId))).resolves.toMatchObject({
      status: "expired",
      reservedSeat: false,
    });
  });

  it("旧招待の承認時にもreadOnly非staff人物の人数増分を再検証する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedFullProWithReadOnlyNonStaff(ctx, "readonly_invite_accept");
      const now = Date.now();
      const version = 1;
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: base.targetEmail,
        emailNormalized: base.targetEmail,
        tokenDigest: "pending-readonly-invitation",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      const token = await deriveInvitationToken({ invitationId, version, signingSecret: SIGNING_SECRET });
      await ctx.db.patch(invitationId, { tokenDigest: await digestInvitationToken(token) });
      return { ...base, invitationId, token };
    });

    await expect(
      t
        .withIdentity({ subject: "readonly_invite_accept_target", email: ids.targetEmail, emailVerified: true })
        .mutation(api.organizationInvitation.mutations.accept, { token: ids.token }),
    ).resolves.toEqual({ status: "unavailable" });
    const state = await t.run(async (ctx) => ({
      invitation: await ctx.db.get(ids.invitationId),
      member: await ctx.db.get(ids.targetMemberId),
    }));
    expect(state.invitation).toMatchObject({ status: "pending", reservedSeat: false });
    expect(state.member?.status).toBe("readOnly");
  });

  it("招待後に既存人物のメールが変わってもreservedSeatを信用せず新規人物の増分を検証する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "invitation_email_drift_owner",
        plan: "pro",
      });
      const target = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "invitation_email_drift_staff",
        email: "before-change@example.com",
      });
      for (let index = 0; index < 18; index += 1) {
        await seedActiveOrganizationStaff(ctx, {
          organizationId: manager.organizationId,
          shopId: manager.shopId,
          subject: `invitation_email_drift_filler_${index}`,
        });
      }
      return { ...manager, target };
    });
    const owner = t.withIdentity({ subject: "invitation_email_drift_owner" });
    const created = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: ids.shopId,
      email: ids.target.email,
      requestId: "invitation-email-drift-create",
    });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    expect(invitation.reservedSeat).toBe(false);
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });

    await owner.mutation(api.staff.mutations.editStaff, {
      shopId: ids.shopId,
      staffId: ids.target.staffId,
      name: "変更後スタッフ",
      email: "after-change@example.com",
    });
    await expect(
      t
        .withIdentity({
          subject: "new_owner_of_old_email",
          email: "before-change@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.accept, { token }),
    ).resolves.toEqual({ status: "unavailable" });

    const state = await t.run(async (ctx) => ({
      invitation: await ctx.db.get(invitation._id),
      oldEmailPeople: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", ids.organizationId).eq("emailNormalized", "before-change@example.com"),
        )
        .collect(),
    }));
    expect(state.invitation?.status).toBe("issued");
    expect(state.oldEmailPeople).toEqual([]);
  });

  it("上限境界の招待承認とスタッフ追加が並行しても一方だけを保存する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "parallel_accept_owner",
        plan: "pro",
      });
      for (let index = 0; index < 18; index += 1) {
        await seedActiveOrganizationStaff(ctx, {
          organizationId: manager.organizationId,
          shopId: manager.shopId,
          subject: `parallel_accept_filler_${index}`,
        });
      }
      return manager;
    });
    const created = await t
      .withIdentity({ subject: "parallel_accept_owner" })
      .mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.shopId,
        email: "parallel-accept@example.com",
        requestId: "parallel-accept-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });

    const [acceptResult, staffResult] = await Promise.allSettled([
      t
        .withIdentity({
          subject: "parallel_accept_target",
          email: "parallel-accept@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.accept, { token }),
      t.withIdentity({ subject: "parallel_accept_owner" }).mutation(api.staff.mutations.addStaffs, {
        shopId: ids.shopId,
        requestId: "parallel-staff-add",
        entries: [{ name: "競合スタッフ", email: "parallel-staff@example.com" }],
      }),
    ]);

    expect(acceptResult).toMatchObject({ status: "fulfilled", value: { status: "accepted" } });
    expect(staffResult.status).toBe("rejected");
    const state = await t.run(async (ctx) => ({
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      targetMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("status", "active"),
        )
        .collect(),
      competingStaff: await ctx.db
        .query("staffs")
        .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
          q.eq("shopId", ids.shopId).eq("emailNormalized", "parallel-staff@example.com").eq("isDeleted", false),
        )
        .collect(),
    }));
    expect(state.people).toHaveLength(20);
    expect(state.targetMembers).toHaveLength(2);
    expect(state.competingStaff).toEqual([]);
  });

  it("再送は古いURLと予約を失効させ、新しい招待だけを有効にする", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "resend_owner", email: "owner@example.com", plan: "business" }),
    );
    const owner = t.withIdentity({ subject: "resend_owner", email: "owner@example.com" });
    const first = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "resend@example.com",
      requestId: "create-resend",
    });
    await t.finishInProgressScheduledFunctions();
    const firstDoc = await t.run((ctx) => ctx.db.get(first.invitationId));
    if (!firstDoc) throw new Error("invitation not found");
    const firstToken = await deriveInvitationToken({
      invitationId: firstDoc._id,
      version: firstDoc.version,
      signingSecret: SIGNING_SECRET,
    });

    const resent = await owner.mutation(api.organizationInvitation.mutations.resend, {
      shopId: manager.shopId,
      invitationId: first.invitationId,
      requestId: "resend-1",
    });
    await t.finishInProgressScheduledFunctions();
    const secondDoc = await t.run((ctx) => ctx.db.get(resent.invitationId));
    if (!secondDoc) throw new Error("resent invitation not found");
    const secondToken = await deriveInvitationToken({
      invitationId: secondDoc._id,
      version: secondDoc.version,
      signingSecret: SIGNING_SECRET,
    });

    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: firstToken })).resolves.toEqual({
      status: "revoked",
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: secondToken })).resolves.toMatchObject(
      {
        status: "ready",
      },
    );
    const invitations = await t.run((ctx) =>
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
          q.eq("organizationId", manager.organizationId).eq("emailNormalized", "resend@example.com"),
        )
        .collect(),
    );
    expect(invitations.filter((item) => item.status === "issued" && item.reservedSeat)).toHaveLength(1);
  });

  it("取消・期限切れ・発行者失効では承認できず、予約枠を解放する", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "revoke_owner", email: "owner@example.com", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "revoke_owner", email: "owner@example.com" });
    const created = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "revoked@example.com",
      requestId: "create-revoke",
    });
    await t.finishInProgressScheduledFunctions();
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });

    await owner.mutation(api.organizationInvitation.mutations.revoke, {
      shopId: manager.shopId,
      invitationId: created.invitationId,
      requestId: "revoke-1",
    });
    await expect(
      t
        .withIdentity({ subject: "revoked", email: "revoked@example.com", emailVerified: true })
        .mutation(api.organizationInvitation.mutations.accept, { token }),
    ).resolves.toEqual({ status: "revoked" });
    expect(await t.run((ctx) => ctx.db.get(created.invitationId))).toMatchObject({ reservedSeat: false });

    const createdByInvalidatedOwner = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "owner-invalidated@example.com",
      requestId: "create-owner-invalidated",
    });
    await t.finishInProgressScheduledFunctions();
    const ownerInvalidatedDoc = await t.run((ctx) => ctx.db.get(createdByInvalidatedOwner.invitationId));
    if (!ownerInvalidatedDoc) throw new Error("invitation not found");
    const ownerInvalidatedToken = await deriveInvitationToken({
      invitationId: ownerInvalidatedDoc._id,
      version: ownerInvalidatedDoc.version,
      signingSecret: SIGNING_SECRET,
    });
    await t.run((ctx) => ctx.db.patch(manager.memberId, { status: "removed", updatedAt: Date.now() }));
    await expect(
      t
        .withIdentity({
          subject: "owner_invalidated",
          email: "owner-invalidated@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.accept, { token: ownerInvalidatedToken }),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("招待作成後に発行者の事業者所属が重複した場合は任意の所属を根拠に承認しない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "duplicate_inviter_membership_owner",
        email: "duplicate-inviter-owner@example.com",
        plan: "pro",
      }),
    );
    const created = await t
      .withIdentity({ subject: "duplicate_inviter_membership_owner" })
      .mutation(api.organizationInvitation.mutations.create, {
        shopId: manager.shopId,
        email: "duplicate-inviter-target@example.com",
        requestId: "duplicate-inviter-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("organizationMembers", {
        organizationId: manager.organizationId,
        personId: manager.personId,
        userId: manager.userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(t.query(api.organizationInvitation.queries.getPreview, { token })).resolves.toEqual({
      status: "unavailable",
    });
    await expect(
      t.query(internal.organizationInvitation.queries.getEnqueueData, {
        invitationId: invitation._id,
        expectedVersion: invitation.version,
      }),
    ).resolves.toBeNull();
    await expect(
      t
        .withIdentity({
          subject: "duplicate_inviter_membership_target",
          email: "duplicate-inviter-target@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.accept, { token }),
    ).resolves.toEqual({ status: "unavailable" });

    const result = await t.run(async (ctx) => ({
      invitation: await ctx.db.get(invitation._id),
      targetPeople: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", manager.organizationId).eq("emailNormalized", "duplicate-inviter-target@example.com"),
        )
        .collect(),
    }));
    expect(result.invitation).toMatchObject({ status: "issued", reservedSeat: true, version: 1 });
    expect(result.targetPeople).toEqual([]);
  });

  it("別事業者の管理者は招待を取り消せず、期限処理はstale jobをno-opにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => ({
      first: await seedOrganizationManagerShop(ctx, { subject: "idor_first", plan: "pro" }),
      second: await seedOrganizationManagerShop(ctx, { subject: "idor_second", plan: "pro" }),
    }));
    const created = await t
      .withIdentity({ subject: "idor_first" })
      .mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.first.shopId,
        email: "idor-invitee@example.com",
        requestId: "idor-create",
      });
    await t.finishInProgressScheduledFunctions();
    await expect(
      t.withIdentity({ subject: "idor_second" }).mutation(api.organizationInvitation.mutations.revoke, {
        shopId: ids.second.shopId,
        invitationId: created.invitationId,
        requestId: "idor-revoke",
      }),
    ).rejects.toThrow(ConvexError);

    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    await expect(
      t.mutation(internal.organizationInvitation.mutations.expire, {
        invitationId: invitation._id,
        expectedVersion: invitation.version + 1,
        expectedExpiresAt: invitation.expiresAt,
      }),
    ).resolves.toEqual({ changed: false });
  });

  it("Freeからの支払い結果待ちでも既存スタッフとの管理者交代を作成・再送・承認できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, {
        subject: "free_exchange_owner",
        email: "free-owner@example.com",
        plan: "free",
      });
      const target = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "free_exchange_target",
        email: "free-target@example.com",
      });
      const ownerStaffId = await ctx.db.insert("staffs", {
        shopId: manager.shopId,
        organizationId: manager.organizationId,
        organizationPersonId: manager.personId,
        userId: manager.userId,
        name: "管理者兼スタッフ",
        email: "free-owner@example.com",
        emailNormalized: "free-owner@example.com",
        isDeleted: false,
      });
      await ctx.db.insert("shopMembers", {
        shopId: manager.shopId,
        userId: manager.userId,
        role: "manager",
        isDeleted: false,
      });
      const insertNotification = async (dedupeKey: string, purpose: "business" | "billing", staffId?: Id<"staffs">) =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "pending",
          dedupeKey,
          shopId: manager.shopId,
          organizationId: manager.organizationId,
          purpose,
          ...(staffId ? { staffId } : {}),
          userId: manager.userId,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "free-owner@example.com",
            subject: "テスト通知",
            html: "<p>test</p>",
            context: dedupeKey,
          },
          attemptCount: 0,
          nextRunAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      const managerNotificationId = await insertNotification("free-exchange:manager", "business");
      const billingNotificationId = await insertNotification("free-exchange:billing", "billing");
      const staffNotificationId = await insertNotification("free-exchange:staff", "business", ownerStaffId);
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", manager.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "pendingActivation",
          plan: "pro",
          fallback: "free",
          startedAt: Date.now(),
        },
      });
      return {
        ...manager,
        target,
        ownerStaffId,
        managerNotificationId,
        billingNotificationId,
        staffNotificationId,
      };
    });
    const owner = t.withIdentity({ subject: "free_exchange_owner", email: "free-owner@example.com" });
    const created = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: ids.shopId,
      email: " Free-Target@Example.com ",
      requestId: "free-exchange-create",
    });
    const first = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!first) throw new Error("invitation not found");
    expect(first).toMatchObject({ purpose: "freeManagerExchange", reservedSeat: false, status: "issued" });
    const firstToken = await deriveInvitationToken({
      invitationId: first._id,
      version: first.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      t.query(internal.organizationInvitation.queries.getEnqueueData, {
        invitationId: first._id,
        expectedVersion: first.version,
      }),
    ).resolves.toMatchObject({ organizationId: ids.organizationId, email: "Free-Target@Example.com" });
    await expect(
      t.action(internal.organizationInvitation.actions.enqueueManagerInvitation, {
        invitationId: first._id,
        expectedVersion: first.version,
      }),
    ).resolves.toEqual({ enqueued: true });
    const invitationJob = await t.run((ctx) =>
      ctx.db
        .query("notificationOutbox")
        .collect()
        .then((jobs) => jobs.find((job) => job.organizationInvitationId === first._id) ?? null),
    );
    if (!invitationJob) throw new Error("invitation outbox job not found");
    await t.run((ctx) => ctx.db.patch(invitationJob._id, { status: "processing" }));
    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareOrganizationManagerInvitationEmail, {
        outboxId: invitationJob._id,
        now: Date.now(),
      }),
    ).resolves.toMatchObject({ invitationId: first._id, invitationVersion: first.version });

    const beforeResend = await t.run(async (ctx) => ({
      ownerMember: await ctx.db.get(ids.memberId),
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    }));
    expect(beforeResend.ownerMember?.status).toBe("active");
    expect(beforeResend.billing?.freeManagerPersonId).toBe(ids.personId);

    const resent = await owner.mutation(api.organizationInvitation.mutations.resend, {
      shopId: ids.shopId,
      invitationId: first._id,
      requestId: "free-exchange-resend",
    });
    const second = await t.run((ctx) => ctx.db.get(resent.invitationId));
    if (!second) throw new Error("resent invitation not found");
    expect(second).toMatchObject({ purpose: "freeManagerExchange", reservedSeat: false, status: "issued" });
    const secondToken = await deriveInvitationToken({
      invitationId: second._id,
      version: second.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: firstToken })).resolves.toEqual({
      status: "revoked",
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: secondToken })).resolves.toMatchObject(
      {
        status: "ready",
      },
    );

    const accepted = await t
      .withIdentity({ subject: "free_exchange_target", email: "free-target@example.com", emailVerified: true })
      .mutation(api.organizationInvitation.mutations.accept, { token: secondToken });
    expect(accepted).toEqual({ status: "accepted", organizationId: ids.organizationId, shopId: ids.shopId });

    const result = await t.run(async (ctx) => {
      const targetMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", ids.organizationId).eq("personId", ids.target.personId),
        )
        .collect();
      const activeMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("status", "active"),
        )
        .collect();
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", ids.organizationId))
        .collect();
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      const legacyMemberships = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", ids.target.userId).eq("shopId", ids.shopId))
        .collect();
      const ownerLegacyMemberships = await ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_shopId", (q) => q.eq("userId", ids.userId).eq("shopId", ids.shopId))
        .collect();
      const audits = await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect();
      return {
        targetMembers,
        activeMembers,
        people,
        billing,
        legacyMemberships,
        ownerLegacyMemberships,
        audits,
        ownerMember: await ctx.db.get(ids.memberId),
        ownerPerson: await ctx.db.get(ids.personId),
        ownerStaff: await ctx.db.get(ids.ownerStaffId),
        managerNotification: await ctx.db.get(ids.managerNotificationId),
        billingNotification: await ctx.db.get(ids.billingNotificationId),
        staffNotification: await ctx.db.get(ids.staffNotificationId),
        targetStaff: await ctx.db.get(ids.target.staffId),
        invitation: await ctx.db.get(second._id),
      };
    });
    expect(result.ownerMember?.status).toBe("removed");
    expect(result.targetMembers).toHaveLength(1);
    expect(result.targetMembers[0]?.status).toBe("active");
    expect(result.activeMembers.map((member) => member.personId)).toEqual([ids.target.personId]);
    expect(result.people).toHaveLength(2);
    expect(result.ownerPerson?.status).toBe("active");
    expect(result.ownerStaff).toMatchObject({ isDeleted: false });
    expect(result.targetStaff?.isDeleted).toBe(false);
    expect(result.billing).toMatchObject({
      state: { kind: "pendingActivation", fallback: "free", plan: "pro" },
      freeManagerPersonId: ids.target.personId,
      version: 2,
    });
    expect(result.legacyMemberships).toHaveLength(1);
    expect(result.legacyMemberships[0]?.isDeleted).toBe(false);
    expect(result.ownerLegacyMemberships).toHaveLength(1);
    expect(result.ownerLegacyMemberships[0]?.isDeleted).toBe(true);
    expect(result.managerNotification).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(result.billingNotification).toMatchObject({ status: "cancelled", cancelReason: "recipient_inactive" });
    expect(result.staffNotification).toMatchObject({ status: "pending" });
    expect(result.invitation).toMatchObject({ status: "linked", reservedSeat: false });
    expect(result.audits.map((audit) => audit.action)).toEqual(
      expect.arrayContaining(["organization.manager_invitation_linked", "organization.free_selection_changed"]),
    );
    expect(result.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "organization.manager_role_removed",
          targetId: ids.personId,
          toState: "staffOnly",
        }),
      ]),
    );
  });

  it("アーカイブ・プラン停止中の店舗からも有効管理者が事業者招待を操作できる", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "inactive_shop_inviter", plan: "pro" });
      await ctx.db.patch(seeded.shopId, { operatingStatus: "archived" });
      return seeded;
    });
    const owner = t.withIdentity({ subject: "inactive_shop_inviter" });
    const created = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "inactive-shop-invitee@example.com",
      requestId: "inactive-shop-create",
    });
    await t.run((ctx) => ctx.db.patch(manager.shopId, { operatingStatus: "planSuspended" }));
    const resent = await owner.mutation(api.organizationInvitation.mutations.resend, {
      shopId: manager.shopId,
      invitationId: created.invitationId,
      requestId: "inactive-shop-resend",
    });
    await expect(
      owner.mutation(api.organizationInvitation.mutations.revoke, {
        shopId: manager.shopId,
        invitationId: resent.invitationId,
        requestId: "inactive-shop-revoke",
      }),
    ).resolves.toEqual({ status: "revoked", invitationId: resent.invitationId });
  });

  it.each(["planSuspended", "archived"] as const)(
    "%sのみの事業者へ参加した承認結果は閲覧可能な店舗を返す",
    async (operatingStatus) => {
      const t = convexTest(schema, modules);
      const manager = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: `inactive_destination_owner_${operatingStatus}`,
          plan: "pro",
        });
        await ctx.db.patch(seeded.shopId, { operatingStatus });
        return seeded;
      });
      const created = await t
        .withIdentity({ subject: `inactive_destination_owner_${operatingStatus}` })
        .mutation(api.organizationInvitation.mutations.create, {
          shopId: manager.shopId,
          email: `inactive-destination-${operatingStatus}@example.com`,
          requestId: `inactive-destination-${operatingStatus}`,
        });
      const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
      if (!invitation) throw new Error("invitation not found");
      const token = await deriveInvitationToken({
        invitationId: invitation._id,
        version: invitation.version,
        signingSecret: SIGNING_SECRET,
      });

      await expect(
        t
          .withIdentity({
            subject: `inactive_destination_invitee_${operatingStatus}`,
            email: `inactive-destination-${operatingStatus}@example.com`,
            emailVerified: true,
          })
          .mutation(api.organizationInvitation.mutations.accept, { token }),
      ).resolves.toEqual({
        status: "accepted",
        organizationId: manager.organizationId,
        shopId: manager.shopId,
      });
    },
  );

  it("Free交代招待の取消・期限切れでは現管理者を変更せず、同時に二件発行しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, { subject: "free_cancel_owner", plan: "free" });
      const firstTarget = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "free_cancel_first",
      });
      const secondTarget = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "free_cancel_second",
      });
      return { ...manager, firstTarget, secondTarget };
    });
    const owner = t.withIdentity({ subject: "free_cancel_owner" });
    const first = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: ids.shopId,
      email: ids.firstTarget.email,
      requestId: "free-cancel-first",
    });
    await expect(
      owner.mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.shopId,
        email: ids.secondTarget.email,
        requestId: "free-cancel-second-blocked",
      }),
    ).rejects.toThrow(ConvexError);
    await owner.mutation(api.organizationInvitation.mutations.revoke, {
      shopId: ids.shopId,
      invitationId: first.invitationId,
      requestId: "free-cancel-revoke",
    });

    const second = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: ids.shopId,
      email: ids.secondTarget.email,
      requestId: "free-expire-second",
    });
    const secondDoc = await t.run((ctx) => ctx.db.get(second.invitationId));
    if (!secondDoc) throw new Error("invitation not found");
    vi.setSystemTime(new Date(secondDoc.expiresAt + 1));
    await expect(
      t.mutation(internal.organizationInvitation.mutations.expire, {
        invitationId: secondDoc._id,
        expectedVersion: secondDoc.version,
        expectedExpiresAt: secondDoc.expiresAt,
      }),
    ).resolves.toEqual({ changed: true });

    const state = await t.run(async (ctx) => ({
      owner: await ctx.db.get(ids.memberId),
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      firstTargetMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", ids.organizationId).eq("personId", ids.firstTarget.personId),
        )
        .collect(),
      secondTargetMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", ids.organizationId).eq("personId", ids.secondTarget.personId),
        )
        .collect(),
    }));
    expect(state.owner?.status).toBe("active");
    expect(state.billing?.freeManagerPersonId).toBe(ids.personId);
    expect(state.firstTargetMembers).toHaveLength(0);
    expect(state.secondTargetMembers).toHaveLength(0);
  });

  it("Free交代の承認時に利用人数を再確認し、招待後の上限超過では交代しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, { subject: "free_capacity_owner", plan: "free" });
      const target = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "free_capacity_target",
      });
      for (let index = 0; index < 3; index += 1) {
        await seedActiveOrganizationStaff(ctx, {
          organizationId: manager.organizationId,
          shopId: manager.shopId,
          subject: `free_capacity_existing_${index}`,
        });
      }
      return { ...manager, target };
    });
    const created = await t
      .withIdentity({ subject: "free_capacity_owner" })
      .mutation(api.organizationInvitation.mutations.create, {
        shopId: ids.shopId,
        email: ids.target.email,
        requestId: "free-capacity-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    await t.run((ctx) =>
      seedActiveOrganizationStaff(ctx, {
        organizationId: ids.organizationId,
        shopId: ids.shopId,
        subject: "free_capacity_concurrent",
      }),
    );
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      t
        .withIdentity({ subject: "free_capacity_target", email: ids.target.email, emailVerified: true })
        .mutation(api.organizationInvitation.mutations.accept, { token }),
    ).resolves.toEqual({ status: "unavailable" });
    const state = await t.run(async (ctx) => ({
      owner: await ctx.db.get(ids.memberId),
      targetMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", ids.organizationId).eq("personId", ids.target.personId),
        )
        .collect(),
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    }));
    expect(state.owner?.status).toBe("active");
    expect(state.targetMembers).toHaveLength(0);
    expect(state.billing?.freeManagerPersonId).toBe(ids.personId);
  });

  it("Free交代は新規人物・他事業者人物・非スタッフ・削除済み人物・重複所属を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, { subject: "free_reject_owner", plan: "free" });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "free_reject_other",
        email: "other-org@example.com",
        plan: "free",
      });
      const now = Date.now();
      const nonStaffUserId = await seedUser(ctx, "free_reject_nonstaff", "nonstaff@example.com");
      await ctx.db.insert("organizationPeople", {
        organizationId: manager.organizationId,
        userId: nonStaffUserId,
        name: "非スタッフ",
        email: "nonstaff@example.com",
        emailNormalized: "nonstaff@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const removed = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "free_reject_removed",
      });
      await ctx.db.patch(removed.personId, { status: "removed", updatedAt: now });
      const duplicate = await seedActiveOrganizationStaff(ctx, {
        organizationId: manager.organizationId,
        shopId: manager.shopId,
        subject: "free_reject_duplicate",
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: manager.organizationId,
        personId: duplicate.personId,
        userId: duplicate.userId,
        status: "readOnly",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: manager.organizationId,
        personId: duplicate.personId,
        userId: duplicate.userId,
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      return { ...manager, other, removed, duplicate };
    });
    const owner = t.withIdentity({ subject: "free_reject_owner" });
    for (const [email, requestId] of [
      ["brand-new@example.com", "free-reject-new"],
      ["other-org@example.com", "free-reject-other"],
      ["nonstaff@example.com", "free-reject-nonstaff"],
      [ids.removed.email, "free-reject-removed"],
      [ids.duplicate.email, "free-reject-duplicate"],
    ] as const) {
      await expect(
        owner.mutation(api.organizationInvitation.mutations.create, {
          shopId: ids.shopId,
          email,
          requestId,
        }),
      ).rejects.toThrow(ConvexError);
    }
  });

  it("期限切れ招待を新URLとして再発行し、古いURLと予約枠を復活させない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "expired_resend_owner", plan: "pro" }),
    );
    const owner = t.withIdentity({ subject: "expired_resend_owner" });
    const created = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: manager.shopId,
      email: "expired-resend@example.com",
      requestId: "expired-resend-create",
    });
    const oldInvitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!oldInvitation) throw new Error("invitation not found");
    const oldToken = await deriveInvitationToken({
      invitationId: oldInvitation._id,
      version: oldInvitation.version,
      signingSecret: SIGNING_SECRET,
    });
    vi.setSystemTime(new Date(oldInvitation.expiresAt + 1));
    await t.mutation(internal.organizationInvitation.mutations.expire, {
      invitationId: oldInvitation._id,
      expectedVersion: oldInvitation.version,
      expectedExpiresAt: oldInvitation.expiresAt,
    });
    const resent = await owner.mutation(api.organizationInvitation.mutations.resend, {
      shopId: manager.shopId,
      invitationId: oldInvitation._id,
      requestId: "expired-resend-new-url",
    });
    const newInvitation = await t.run((ctx) => ctx.db.get(resent.invitationId));
    if (!newInvitation) throw new Error("resent invitation not found");
    const newToken = await deriveInvitationToken({
      invitationId: newInvitation._id,
      version: newInvitation.version,
      signingSecret: SIGNING_SECRET,
    });
    expect(await t.run((ctx) => ctx.db.get(oldInvitation._id))).toMatchObject({
      status: "expired",
      reservedSeat: false,
      version: oldInvitation.version + 2,
    });
    expect(newInvitation).toMatchObject({
      status: "issued",
      purpose: "managerAddition",
      reservedSeat: true,
      predecessorInvitationId: oldInvitation._id,
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: oldToken })).resolves.toEqual({
      status: "expired",
    });
    await expect(t.query(api.organizationInvitation.queries.getPreview, { token: newToken })).resolves.toMatchObject({
      status: "ready",
    });
    await expect(
      owner.mutation(api.organizationInvitation.mutations.resend, {
        shopId: manager.shopId,
        invitationId: oldInvitation._id,
        requestId: "expired-resend-old-again",
      }),
    ).resolves.toEqual({ status: "alreadyPending", invitationId: newInvitation._id });
    const activeInvitations = await t.run((ctx) =>
      ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
          q
            .eq("organizationId", manager.organizationId)
            .eq("emailNormalized", "expired-resend@example.com")
            .eq("status", "issued"),
        )
        .collect(),
    );
    expect(activeInvitations.filter((invitation) => invitation.expiresAt > Date.now())).toHaveLength(1);
  });

  it("招待後に同じ人物がスタッフ化されても、承認時に予約枠を二重計上しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "seat_transfer_owner", plan: "pro" }));
    const owner = t.withIdentity({ subject: "seat_transfer_owner" });
    const created = await owner.mutation(api.organizationInvitation.mutations.create, {
      shopId: ids.shopId,
      email: "seat-transfer-target@example.com",
      requestId: "seat-transfer-create",
    });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    expect(invitation.reservedSeat).toBe(true);

    await t.run(async (ctx) => {
      await seedActiveOrganizationStaff(ctx, {
        organizationId: ids.organizationId,
        shopId: ids.shopId,
        subject: "seat_transfer_target",
        email: "seat-transfer-target@example.com",
      });
      for (let index = 0; index < 13; index += 1) {
        await seedActiveOrganizationStaff(ctx, {
          organizationId: ids.organizationId,
          shopId: ids.shopId,
          subject: `seat_transfer_fill_${index}`,
        });
      }
    });
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(
      t
        .withIdentity({
          subject: "seat_transfer_target",
          email: "seat-transfer-target@example.com",
          emailVerified: true,
        })
        .mutation(api.organizationInvitation.mutations.accept, { token }),
    ).resolves.toMatchObject({ status: "accepted", organizationId: ids.organizationId });
    expect(await t.run((ctx) => ctx.db.get(invitation._id))).toMatchObject({
      status: "linked",
      reservedSeat: false,
    });
  });
});

function extractOrganizationSettingsActionUrl(html: string) {
  const href = html.match(/<a href="([^"]+)"[^>]*>グループ設定を確認する<\/a>/)?.[1];
  if (!href) throw new Error("organization settings action URL not found");
  return new URL(href.replaceAll("&amp;", "&"));
}
