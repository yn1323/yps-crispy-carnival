import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { isOrganizationInvitationIssued, isOrganizationInvitationLinked } from "./lifecycle";
import { resolveOrganizationInvitationEligibility } from "./service";
import { digestInvitationToken } from "./token";

const invitationPreviewValidator = v.union(
  v.object({ status: v.literal("ready"), organizationName: v.string(), expiresAt: v.number() }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("revoked") }),
  v.object({ status: v.literal("used") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("invalid") }),
);

export const getPreview = query({
  args: { token: v.string() },
  returns: invitationPreviewValidator,
  handler: async (ctx, args) => {
    if (args.token.length !== 43) return { status: "invalid" as const };
    const tokenDigest = await digestInvitationToken(args.token);
    const invitations = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_tokenDigest", (q) => q.eq("tokenDigest", tokenDigest))
      .take(2);
    if (invitations.length !== 1) return { status: "invalid" as const };
    const invitation = invitations[0];
    if (isOrganizationInvitationLinked(invitation)) return { status: "used" as const };
    if (invitation.status === "revoked") return { status: "revoked" as const };
    if (invitation.status === "expired" || invitation.expiresAt <= Date.now()) {
      return { status: "expired" as const };
    }

    const eligibility = await resolveOrganizationInvitationEligibility(ctx, invitation);
    if (!eligibility) return { status: "unavailable" as const };
    return {
      status: "ready" as const,
      organizationName: eligibility.organization.name,
      expiresAt: invitation.expiresAt,
    };
  },
});

export const getEnqueueData = internalQuery({
  args: { invitationId: v.id("organizationInvitations"), expectedVersion: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.id("organizations"),
      organizationName: v.string(),
      email: v.string(),
      invitationVersion: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (
      !invitation ||
      !isOrganizationInvitationIssued(invitation) ||
      invitation.version !== args.expectedVersion ||
      invitation.expiresAt <= Date.now()
    ) {
      return null;
    }
    const eligibility = await resolveOrganizationInvitationEligibility(ctx, invitation);
    if (!eligibility) return null;
    return {
      organizationId: eligibility.organization._id,
      organizationName: eligibility.organization.name,
      email: invitation.email,
      invitationVersion: invitation.version,
    };
  },
});

export const getAcceptanceNotificationData = internalQuery({
  args: { invitationId: v.id("organizationInvitations"), expectedVersion: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.id("organizations"),
      organizationName: v.string(),
      recipients: v.array(v.object({ userId: v.id("users"), name: v.string(), email: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || !isOrganizationInvitationLinked(invitation) || invitation.version !== args.expectedVersion) {
      return null;
    }
    const organization = await ctx.db.get(invitation.organizationId);
    if (!organization || organization.isDeleted) return null;

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("status", "active"),
      )
      .collect();
    const recipients = [];
    for (const member of members) {
      const [person, user] = await Promise.all([ctx.db.get(member.personId), ctx.db.get(member.userId)]);
      if (
        !person ||
        person.organizationId !== invitation.organizationId ||
        person.userId !== member.userId ||
        person.status !== "active" ||
        !user ||
        user.isDeleted
      ) {
        continue;
      }
      recipients.push({ userId: user._id, name: person.name, email: person.email });
    }
    return { organizationId: organization._id, organizationName: organization.name, recipients };
  },
});
