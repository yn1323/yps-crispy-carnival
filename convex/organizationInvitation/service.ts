import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { resolveOrganizationPersonEmailForManagerAddition } from "../_lib/personIdentity";
import { getOrganizationBillingState } from "../organization/service";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export type OrganizationInvitationEligibility = {
  organization: Doc<"organizations">;
  inviter: Doc<"organizationMembers">;
  inviterPerson: Doc<"organizationPeople">;
};

async function getValidInviter(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    inviterMemberId: Id<"organizationMembers">;
  },
) {
  const inviter = await ctx.db.get(args.inviterMemberId);
  if (!inviter || inviter.organizationId !== args.organizationId || inviter.status !== "active") return null;
  const [person, user, memberships] = await Promise.all([
    ctx.db.get(inviter.personId),
    ctx.db.get(inviter.userId),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", inviter.userId).eq("organizationId", args.organizationId),
      )
      .take(2),
  ]);
  if (
    memberships.length !== 1 ||
    memberships[0]._id !== inviter._id ||
    !person ||
    person.organizationId !== args.organizationId ||
    person.status !== "active" ||
    person.userId !== inviter.userId ||
    !user ||
    user.isDeleted
  ) {
    return null;
  }
  return { inviter, inviterPerson: person };
}

async function getInvitationTargetPeople(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    emailNormalized: string;
    targetPersonId?: Id<"organizationPeople">;
  },
) {
  if (args.targetPersonId) {
    const person = await ctx.db.get(args.targetPersonId);
    return person && person.organizationId === args.organizationId && person.emailNormalized === args.emailNormalized
      ? [person]
      : [];
  }
  const resolution = await resolveOrganizationPersonEmailForManagerAddition(ctx, args);
  return resolution.kind === "active" || resolution.kind === "removed" ? [resolution.person] : [];
}

export async function resolveOrganizationInvitationEligibility(
  ctx: DbCtx,
  invitation: Pick<
    Doc<"organizationInvitations">,
    "organizationId" | "inviterMemberId" | "emailNormalized" | "targetPersonId"
  >,
): Promise<OrganizationInvitationEligibility | null> {
  const [organization, billingState, inviterData] = await Promise.all([
    ctx.db.get(invitation.organizationId),
    getOrganizationBillingState(ctx, invitation.organizationId),
    getValidInviter(ctx, invitation),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !billingState ||
    !deriveOrganizationBillingPolicy(billingState.state).canManageManagers ||
    !inviterData
  ) {
    return null;
  }
  const targetResolution = await resolveOrganizationPersonEmailForManagerAddition(ctx, {
    organizationId: invitation.organizationId,
    emailNormalized: invitation.emailNormalized,
  });
  if (targetResolution.kind === "conflict") return null;
  if (invitation.targetPersonId) {
    const targetPeople = await getInvitationTargetPeople(ctx, invitation);
    if (targetPeople.length !== 1) return null;
    const targetPerson = targetPeople[0];
    if (
      (targetResolution.kind !== "active" && targetResolution.kind !== "removed") ||
      targetResolution.person._id !== targetPerson._id
    ) {
      return null;
    }
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("personId", targetPerson._id),
      )
      .take(2);
    if (members.length > 1 || members[0]?.status === "active") return null;
    if (members[0] && (!targetPerson.userId || members[0].userId !== targetPerson.userId)) return null;
    if (targetPerson.userId) {
      const user = await ctx.db.get(targetPerson.userId);
      if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) return null;
    }
  }
  return { organization, ...inviterData };
}
