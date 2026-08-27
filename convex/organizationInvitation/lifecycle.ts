import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

export type OrganizationInvitationLifecycleStatus = "issued" | "linked" | "revoked" | "expired";

export function getOrganizationInvitationLifecycleStatus(
  invitation: Pick<Doc<"organizationInvitations">, "status">,
): OrganizationInvitationLifecycleStatus {
  return invitation.status;
}

export function isOrganizationInvitationIssued(invitation: Pick<Doc<"organizationInvitations">, "status">) {
  return getOrganizationInvitationLifecycleStatus(invitation) === "issued";
}

export function isOrganizationInvitationLinked(invitation: Pick<Doc<"organizationInvitations">, "status">) {
  return getOrganizationInvitationLifecycleStatus(invitation) === "linked";
}

export function getOrganizationInvitationLinkedAt(invitation: Pick<Doc<"organizationInvitations">, "linkedAt">) {
  return invitation.linkedAt;
}

export function getOrganizationInvitationLinkedByPersonId(
  invitation: Pick<Doc<"organizationInvitations">, "linkedByPersonId">,
) {
  return invitation.linkedByPersonId;
}

type DbCtx = { db: GenericDatabaseReader<DataModel> };

export async function collectIssuedInvitationsByOrganization(ctx: DbCtx, organizationId: Id<"organizations">) {
  return await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "issued"))
    .collect();
}

/** Operational views only need currently usable invitations. */
export async function readActiveIssuedInvitationsByOrganization(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  now: number,
  limit: number,
) {
  if (!Number.isFinite(now) || !Number.isSafeInteger(limit) || limit < 0) {
    throw new Error("招待一覧の取得条件が不正です");
  }

  const rowLimit = limit + 1;
  const issued = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_status_and_expiresAt", (q) =>
      q.eq("organizationId", organizationId).eq("status", "issued").gt("expiresAt", now),
    )
    .take(rowLimit);

  const invitations = issued
    .sort((left, right) => left.expiresAt - right.expiresAt || left._id.localeCompare(right._id))
    .slice(0, rowLimit);

  return {
    invitations,
    hasOverflow: issued.length > limit,
  };
}

export async function collectIssuedInvitationsByInviter(ctx: DbCtx, inviterMemberId: Id<"organizationMembers">) {
  return await ctx.db
    .query("organizationInvitations")
    .withIndex("by_inviterMemberId_and_status", (q) => q.eq("inviterMemberId", inviterMemberId).eq("status", "issued"))
    .collect();
}

export async function collectLinkedInvitationsByOrganization(ctx: DbCtx, organizationId: Id<"organizations">) {
  return await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "linked"))
    .collect();
}
