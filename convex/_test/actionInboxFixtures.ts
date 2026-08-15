import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "./seed";

const submissionPattern = { kind: "time" as const, startTime: "09:00", endTime: "22:00" };

export async function seedActionInboxSources(
  ctx: MutationCtx,
  args: {
    subject: string;
    now: number;
    shopName?: string;
    deadline?: string;
    periodStart?: string;
    periodEnd?: string;
  },
) {
  const base = await seedOrganizationManagerShop(ctx, {
    subject: args.subject,
    shopName: args.shopName ?? "対応テスト店舗",
    complimentary: true,
  });
  const staffId = await ctx.db.insert("staffs", {
    shopId: base.shopId,
    organizationId: base.organizationId,
    name: "通知対象スタッフ",
    email: "action-staff@example.com",
    emailNormalized: "action-staff@example.com",
    excludedFromShift: false,
    isDeleted: false,
  });
  const recruitmentId = await ctx.db.insert("recruitments", {
    shopId: base.shopId,
    periodStart: args.periodStart ?? "2026-08-15",
    periodEnd: args.periodEnd ?? "2026-08-20",
    deadline: args.deadline ?? "2026-08-13",
    shopClosedDates: [],
    status: "open",
    isDeleted: false,
    submissionPattern,
  });
  const registrationRequestId = await ctx.db.insert("staffRegistrationRequests", {
    shopId: base.shopId,
    name: "登録申請スタッフ",
    email: "registration@example.com",
    emailNormalized: "registration@example.com",
    status: "pending",
    termsConsentVersion: "terms-v1",
    privacyConsentVersion: "privacy-v1",
    termsDocumentVersion: "terms-doc-v1",
    privacyDocumentVersion: "privacy-doc-v1",
    consentedAt: args.now - 2_000,
    createdAt: args.now - 2_000,
  });
  const notificationFailureId = await seedNotificationFailure(ctx, {
    shopId: base.shopId,
    staffId,
    failureKey: `action-visible-${args.subject}`,
    context: "line.sendInviteEmail",
    lastFailedAt: args.now - 1_000,
  });
  const invitationId = await ctx.db.insert("organizationInvitations", {
    organizationId: base.organizationId,
    email: "invitee@example.com",
    emailNormalized: "invitee@example.com",
    invitedName: "招待対象者",
    tokenDigest: `action-invitation-${args.subject}`,
    status: "issued",
    purpose: "managerAddition",
    inviterMemberId: base.memberId,
    reservedSeat: true,
    version: 1,
    expiresAt: args.now + 7 * 24 * 60 * 60 * 1_000,
    createdAt: args.now - 3_000,
    updatedAt: args.now - 3_000,
  });
  await ctx.db.insert("notificationDeliveryEvents", {
    eventType: "enqueue_failed",
    createdAt: args.now - 500,
    expiresAt: args.now + 30 * 24 * 60 * 60 * 1_000,
    organizationId: base.organizationId,
    organizationInvitationId: invitationId,
    organizationInvitationVersion: 1,
  });

  return {
    ...base,
    staffId,
    recruitmentId,
    registrationRequestId,
    notificationFailureId,
    invitationId,
  };
}

export async function seedAdditionalActiveManager(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; subject: string; now: number },
) {
  const userId = await seedUser(ctx, args.subject);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("action inbox manager fixture user was not found");
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    userId,
    name: "継続管理者",
    email: user.email,
    emailNormalized: user.emailNormalized ?? user.email,
    status: "active",
    createdAt: args.now,
    updatedAt: args.now,
  });
  const memberId = await ctx.db.insert("organizationMembers", {
    organizationId: args.organizationId,
    personId,
    userId,
    status: "active",
    createdAt: args.now,
    updatedAt: args.now,
  });
  return { userId, personId, memberId };
}

export async function seedNotificationFailure(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    failureKey: string;
    context: string;
    lastFailedAt: number;
    staffId?: Id<"staffs">;
  },
) {
  return await ctx.db.insert("notificationFailureInbox", {
    failureKey: args.failureKey,
    sourceType: "enqueue",
    status: "open",
    shopId: args.shopId,
    ...(args.staffId ? { staffId: args.staffId } : {}),
    channel: "email",
    dedupeKey: args.failureKey,
    notificationContext: args.context,
    firstFailedAt: args.lastFailedAt,
    lastFailedAt: args.lastFailedAt,
    createdAt: args.lastFailedAt,
    updatedAt: args.lastFailedAt,
  });
}

export async function seedPendingRegistrationRequests(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; count: number; createdAt: number },
) {
  const ids: Id<"staffRegistrationRequests">[] = [];
  for (let index = 0; index < args.count; index += 1) {
    const email = `pagination-${index}@example.com`;
    ids.push(
      await ctx.db.insert("staffRegistrationRequests", {
        shopId: args.shopId,
        name: `追加申請${index}`,
        email,
        emailNormalized: email,
        status: "pending",
        termsConsentVersion: "terms-v1",
        privacyConsentVersion: "privacy-v1",
        termsDocumentVersion: "terms-doc-v1",
        privacyDocumentVersion: "privacy-doc-v1",
        consentedAt: args.createdAt + index,
        createdAt: args.createdAt + index,
      }),
    );
  }
  return ids;
}
