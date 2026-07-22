import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

export type OrganizationInvitationLifecycleStatus = "issued" | "linked" | "revoked" | "expired";

/**
 * TODO[narrow]: Remove the legacy pending/accepted fallbacks after m015 has
 * completed in every deployment and no old application version is running.
 */
export function getOrganizationInvitationLifecycleStatus(
  invitation: Pick<Doc<"organizationInvitations">, "status">,
): OrganizationInvitationLifecycleStatus {
  if (invitation.status === "pending") return "issued";
  if (invitation.status === "accepted") return "linked";
  return invitation.status;
}

export function isOrganizationInvitationIssued(invitation: Pick<Doc<"organizationInvitations">, "status">) {
  return getOrganizationInvitationLifecycleStatus(invitation) === "issued";
}

export function isOrganizationInvitationLinked(invitation: Pick<Doc<"organizationInvitations">, "status">) {
  return getOrganizationInvitationLifecycleStatus(invitation) === "linked";
}

export function getOrganizationInvitationLinkedAt(
  invitation: Pick<Doc<"organizationInvitations">, "linkedAt" | "acceptedAt">,
) {
  // TODO[narrow]: Remove acceptedAt after m015 verification and Narrow.
  return invitation.linkedAt ?? invitation.acceptedAt;
}

export function getOrganizationInvitationLinkedByPersonId(
  invitation: Pick<Doc<"organizationInvitations">, "linkedByPersonId" | "acceptedByPersonId">,
) {
  // TODO[narrow]: Remove acceptedByPersonId after m015 verification and Narrow.
  return invitation.linkedByPersonId ?? invitation.acceptedByPersonId;
}

type DbCtx = { db: GenericDatabaseReader<DataModel> };

export async function collectIssuedInvitationsByOrganization(ctx: DbCtx, organizationId: Id<"organizations">) {
  const [issued, pending] = await Promise.all([
    ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "issued"))
      .collect(),
    ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "pending"))
      .collect(),
  ]);
  return [...issued, ...pending];
}

export async function collectIssuedInvitationsByInviter(ctx: DbCtx, inviterMemberId: Id<"organizationMembers">) {
  const [issued, pending] = await Promise.all([
    ctx.db
      .query("organizationInvitations")
      .withIndex("by_inviterMemberId_and_status", (q) =>
        q.eq("inviterMemberId", inviterMemberId).eq("status", "issued"),
      )
      .collect(),
    ctx.db
      .query("organizationInvitations")
      .withIndex("by_inviterMemberId_and_status", (q) =>
        q.eq("inviterMemberId", inviterMemberId).eq("status", "pending"),
      )
      .collect(),
  ]);
  return [...issued, ...pending];
}

export async function collectLinkedInvitationsByOrganization(ctx: DbCtx, organizationId: Id<"organizations">) {
  const [linked, accepted] = await Promise.all([
    ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "linked"))
      .collect(),
    ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "accepted"))
      .collect(),
  ]);
  return [...linked, ...accepted];
}
