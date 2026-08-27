import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";

async function seedActiveStaff(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; shopId: Id<"shops">; subject: string },
) {
  const email = `${args.subject}@example.com`;
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
  await ctx.db.insert("staffs", {
    shopId: args.shopId,
    organizationId: args.organizationId,
    organizationPersonId: personId,
    userId,
    name: `スタッフ ${args.subject}`,
    email,
    emailNormalized: email,
    excludedFromShift: false,
    isDeleted: false,
  });
  return { personId, email };
}

async function invitationSecurityState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    people: await ctx.db.query("organizationPeople").collect(),
    members: await ctx.db.query("organizationMembers").collect(),
    invitations: await ctx.db.query("organizationInvitations").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    rateLimits: await ctx.db.query("rateLimits").collect(),
  }));
}

describe("organizationInvitation/mutations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00+09:00"));
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("組織単位APIで発行・再送・取消を行い、再送前のURLを失効する", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "invitation_owner", plan: "business" }),
    );
    const owner = t.withIdentity({ subject: "invitation_owner" });
    const issued = await owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
      organizationId: manager.organizationId,
      recipient: { kind: "external", invitedName: "新しい管理者", email: "new-manager@example.com" },
      requestId: "manager-issue-request",
    });

    const resent = await owner.mutation(api.organizationInvitation.mutations.resendForOrganization, {
      organizationId: manager.organizationId,
      invitationId: issued.invitationId,
      requestId: "manager-resend-request",
    });
    expect(resent).toMatchObject({ status: "created" });
    expect(resent.invitationId).not.toBe(issued.invitationId);
    expect(await t.run((ctx) => ctx.db.get(issued.invitationId))).toMatchObject({
      status: "revoked",
      reservedSeat: false,
      version: 2,
    });
    expect(await t.run((ctx) => ctx.db.get(resent.invitationId))).toMatchObject({
      status: "issued",
      predecessorInvitationId: issued.invitationId,
    });
    await expect(
      owner.mutation(api.organizationInvitation.mutations.revokeForOrganization, {
        organizationId: manager.organizationId,
        invitationId: resent.invitationId,
        requestId: "manager-revoke-request",
      }),
    ).resolves.toEqual({ status: "revoked", invitationId: resent.invitationId });
  });

  it("同じ要求は同じ招待へ収束し、同じrequestIdの別対象を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, { subject: "strict_owner", plan: "pro" });
      const first = await seedActiveStaff(ctx, { ...manager, subject: "strict_first" });
      const second = await seedActiveStaff(ctx, { ...manager, subject: "strict_second" });
      return { ...manager, first, second };
    });
    const owner = t.withIdentity({ subject: "strict_owner" });
    const args = {
      organizationId: ids.organizationId,
      recipient: { kind: "existingStaff" as const, personId: ids.first.personId },
      requestId: "strict-issue-request",
    };
    const first = await owner.mutation(api.organizationInvitation.mutations.issueForOrganization, args);

    await expect(owner.mutation(api.organizationInvitation.mutations.issueForOrganization, args)).resolves.toEqual({
      status: "alreadyPending",
      invitationId: first.invitationId,
    });
    await expect(
      owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
        ...args,
        recipient: { kind: "existingStaff", personId: ids.second.personId },
      }),
    ).rejects.toThrow("以前の管理者招待と内容が一致しません");
    expect(await t.run((ctx) => ctx.db.query("organizationInvitations").collect())).toHaveLength(1);
  });

  it("同じ対象の有効招待を暗黙に再送しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const manager = await seedOrganizationManagerShop(ctx, { subject: "pending_owner", plan: "pro" });
      const target = await seedActiveStaff(ctx, { ...manager, subject: "pending_target" });
      return { ...manager, target };
    });
    const owner = t.withIdentity({ subject: "pending_owner" });
    const first = await owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
      organizationId: ids.organizationId,
      recipient: { kind: "existingStaff", personId: ids.target.personId },
      requestId: "pending-first-request",
    });
    const before = await t.run((ctx) => ctx.db.get(first.invitationId));

    await expect(
      owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
        organizationId: ids.organizationId,
        recipient: { kind: "existingStaff", personId: ids.target.personId },
        requestId: "pending-second-request",
      }),
    ).resolves.toEqual({ status: "alreadyPending", invitationId: first.invitationId });
    expect(await t.run((ctx) => ctx.db.get(first.invitationId))).toEqual(before);
  });

  it("外部人物は発行時に作らず、招待へ氏名と予約枠を保存する", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "external_owner", plan: "business" }),
    );
    const issued = await t
      .withIdentity({ subject: "external_owner" })
      .mutation(api.organizationInvitation.mutations.issueForOrganization, {
        organizationId: manager.organizationId,
        recipient: { kind: "external", invitedName: "外部 管理者", email: "external-manager@example.com" },
        requestId: "external-issue-request",
      });

    expect(await t.run((ctx) => ctx.db.get(issued.invitationId))).toMatchObject({
      invitedName: "外部 管理者",
      emailNormalized: "external-manager@example.com",
      status: "issued",
      reservedSeat: true,
    });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) =>
            q.eq("organizationId", manager.organizationId).eq("emailNormalized", "external-manager@example.com"),
          )
          .collect(),
      ),
    ).toEqual([]);
  });

  it("Freeは2人目を招待でき、3人目の予約を拒否する", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "free_owner", plan: "free" }));
    const owner = t.withIdentity({ subject: "free_owner" });
    await expect(
      owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
        organizationId: manager.organizationId,
        recipient: { kind: "external", invitedName: "2人目", email: "free-second@example.com" },
        requestId: "free-second-manager",
      }),
    ).resolves.toMatchObject({ status: "issued" });
    await expect(
      owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
        organizationId: manager.organizationId,
        recipient: { kind: "external", invitedName: "3人目", email: "free-third@example.com" },
        requestId: "free-third-manager",
      }),
    ).rejects.toThrow("管理者");
  });

  it.each(["issue", "resend", "revoke"] as const)("別組織からの%sを副作用なしで拒否する", async (operation) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => ({
      actor: await seedOrganizationManagerShop(ctx, { subject: `cross_${operation}_actor`, plan: "business" }),
      foreign: await seedOrganizationManagerShop(ctx, { subject: `cross_${operation}_foreign`, plan: "business" }),
    }));
    const foreign = t.withIdentity({ subject: `cross_${operation}_foreign` });
    const invitation = await foreign.mutation(api.organizationInvitation.mutations.issueForOrganization, {
      organizationId: ids.foreign.organizationId,
      recipient: { kind: "external", invitedName: "別組織", email: `foreign-${operation}@example.com` },
      requestId: `cross-${operation}-seed`,
    });
    const before = await invitationSecurityState(t);
    const actor = t.withIdentity({ subject: `cross_${operation}_actor` });
    const rejected =
      operation === "issue"
        ? actor.mutation(api.organizationInvitation.mutations.issueForOrganization, {
            organizationId: ids.foreign.organizationId,
            recipient: { kind: "external", invitedName: "不正操作", email: "cross-issue@example.com" },
            requestId: "cross-issue-request",
          })
        : operation === "resend"
          ? actor.mutation(api.organizationInvitation.mutations.resendForOrganization, {
              organizationId: ids.actor.organizationId,
              invitationId: invitation.invitationId,
              requestId: "cross-resend-request",
            })
          : actor.mutation(api.organizationInvitation.mutations.revokeForOrganization, {
              organizationId: ids.actor.organizationId,
              invitationId: invitation.invitationId,
              requestId: "cross-revoke-request",
            });
    await expect(rejected).rejects.toThrow("Not found");
    expect(await invitationSecurityState(t)).toEqual(before);
  });

  it("削除済み管理者は発行・再送・取消を行えない", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "removed_owner", plan: "business" }),
    );
    const owner = t.withIdentity({ subject: "removed_owner" });
    const invitation = await owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
      organizationId: manager.organizationId,
      recipient: { kind: "external", invitedName: "招待先", email: "removed-target@example.com" },
      requestId: "removed-owner-seed",
    });
    await t.run((ctx) => ctx.db.patch(manager.memberId, { status: "removed", updatedAt: Date.now() }));
    const before = await invitationSecurityState(t);

    for (const operation of ["issue", "resend", "revoke"] as const) {
      const rejected =
        operation === "issue"
          ? owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
              organizationId: manager.organizationId,
              recipient: { kind: "external", invitedName: "拒否対象", email: "removed-new@example.com" },
              requestId: "removed-owner-issue",
            })
          : operation === "resend"
            ? owner.mutation(api.organizationInvitation.mutations.resendForOrganization, {
                organizationId: manager.organizationId,
                invitationId: invitation.invitationId,
                requestId: "removed-owner-resend",
              })
            : owner.mutation(api.organizationInvitation.mutations.revokeForOrganization, {
                organizationId: manager.organizationId,
                invitationId: invitation.invitationId,
                requestId: "removed-owner-revoke",
              });
      await expect(rejected).rejects.toThrow("Not found");
    }
    expect(await invitationSecurityState(t)).toEqual(before);
  });

  it("期限処理は現在versionだけを失効し、stale jobをno-opにする", async () => {
    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "expiration_owner", plan: "business" }),
    );
    const issued = await t
      .withIdentity({ subject: "expiration_owner" })
      .mutation(api.organizationInvitation.mutations.issueForOrganization, {
        organizationId: manager.organizationId,
        recipient: { kind: "external", invitedName: "期限対象", email: "expiration@example.com" },
        requestId: "expiration-issue",
      });
    const invitation = await t.run((ctx) => ctx.db.get(issued.invitationId));
    if (!invitation) throw new Error("invitation not found");
    vi.setSystemTime(invitation.expiresAt + 1);

    await expect(
      t.mutation(internal.organizationInvitation.mutations.expire, {
        invitationId: invitation._id,
        expectedVersion: invitation.version + 1,
        expectedExpiresAt: invitation.expiresAt,
      }),
    ).resolves.toEqual({ changed: false });
    await expect(
      t.mutation(internal.organizationInvitation.mutations.expire, {
        invitationId: invitation._id,
        expectedVersion: invitation.version,
        expectedExpiresAt: invitation.expiresAt,
      }),
    ).resolves.toEqual({ changed: true });
    expect(await t.run((ctx) => ctx.db.get(invitation._id))).toMatchObject({
      status: "expired",
      reservedSeat: false,
      version: invitation.version + 1,
    });
  });
});
