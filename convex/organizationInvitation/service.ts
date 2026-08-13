import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { getOrganizationBillingState } from "../organization/service";
import { organizationShopOperatingStatus } from "../organization/shopMembershipChange";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import { getOrganizationInvitationPurpose } from "./purpose";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export type FreeManagerExchangeEligibility = {
  purpose: "freeManagerExchange";
  organization: Doc<"organizations">;
  billingState: Doc<"organizationBillingStates">;
  inviter: Doc<"organizationMembers">;
  inviterPerson: Doc<"organizationPeople">;
  targetPerson: Doc<"organizationPeople">;
  targetMember: Doc<"organizationMembers"> | null;
};

type ManagerAdditionEligibility = {
  purpose: "managerAddition";
  organization: Doc<"organizations">;
  inviter: Doc<"organizationMembers">;
  inviterPerson: Doc<"organizationPeople">;
};

export type OrganizationInvitationEligibility = ManagerAdditionEligibility | FreeManagerExchangeEligibility;

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
  return await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_emailNormalized", (q) =>
      q.eq("organizationId", args.organizationId).eq("emailNormalized", args.emailNormalized),
    )
    .take(2);
}

export async function resolveFreeManagerExchangeEligibility(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    inviterMemberId: Id<"organizationMembers">;
    emailNormalized: string;
    targetPersonId?: Id<"organizationPeople">;
  },
): Promise<FreeManagerExchangeEligibility | null> {
  const [organization, billingState, inviterData, activeMembers, people] = await Promise.all([
    ctx.db.get(args.organizationId),
    getOrganizationBillingState(ctx, args.organizationId),
    getValidInviter(ctx, args),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active"),
      )
      .take(2),
    getInvitationTargetPeople(ctx, args),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !billingState ||
    deriveOrganizationBillingPolicy(billingState.state).entitlementPlan !== "free" ||
    !inviterData ||
    activeMembers.length !== 1 ||
    activeMembers[0]._id !== inviterData.inviter._id ||
    billingState.freeManagerPersonId !== inviterData.inviterPerson._id ||
    people.length !== 1 ||
    people[0].status !== "active" ||
    people[0]._id === inviterData.inviterPerson._id
  ) {
    return null;
  }

  const targetPerson = people[0];
  const [members, staffs] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", args.organizationId).eq("personId", targetPerson._id),
      )
      .take(2),
    ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", args.organizationId).eq("organizationPersonId", targetPerson._id),
      )
      .collect(),
  ]);
  if (members.length > 1 || members[0]?.status === "active" || members[0]?.status === "readOnly") {
    return null;
  }
  let hasActiveStaffAffiliation = false;
  for (const staff of staffs) {
    if (staff.isDeleted) continue;
    const shop = await ctx.db.get(staff.shopId);
    if (
      shop?.organizationId === args.organizationId &&
      !shop.isDeleted &&
      organizationShopOperatingStatus(shop.operatingStatus) === "active"
    ) {
      hasActiveStaffAffiliation = true;
      break;
    }
  }
  if (!hasActiveStaffAffiliation) return null;
  const targetMember = members[0] ?? null;
  if (targetMember && (!targetPerson.userId || targetMember.userId !== targetPerson.userId)) return null;
  if (targetPerson.userId) {
    const targetUser = await ctx.db.get(targetPerson.userId);
    if (!targetUser || targetUser.isDeleted) return null;
  }

  return {
    purpose: "freeManagerExchange",
    organization,
    billingState,
    inviter: inviterData.inviter,
    inviterPerson: inviterData.inviterPerson,
    targetPerson,
    targetMember,
  };
}

export async function resolveOrganizationInvitationEligibility(
  ctx: DbCtx,
  invitation: Pick<
    Doc<"organizationInvitations">,
    "organizationId" | "inviterMemberId" | "emailNormalized" | "purpose" | "targetPersonId"
  >,
): Promise<OrganizationInvitationEligibility | null> {
  const purpose = getOrganizationInvitationPurpose(invitation);
  if (purpose === "freeManagerExchange") {
    return await resolveFreeManagerExchangeEligibility(ctx, invitation);
  }

  const [organization, billingState, inviterData] = await Promise.all([
    ctx.db.get(invitation.organizationId),
    getOrganizationBillingState(ctx, invitation.organizationId),
    getValidInviter(ctx, invitation),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !billingState ||
    !deriveOrganizationBillingPolicy(billingState.state).canUsePaidFeatures ||
    !inviterData
  ) {
    return null;
  }
  if (invitation.targetPersonId) {
    const targetPeople = await getInvitationTargetPeople(ctx, invitation);
    if (targetPeople.length !== 1 || targetPeople[0].status !== "active") return null;
    const targetPerson = targetPeople[0];
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", invitation.organizationId).eq("personId", targetPerson._id),
      )
      .take(2);
    if (members.length > 1 || members[0]?.status === "active" || members[0]?.status === "readOnly") return null;
    if (members[0] && (!targetPerson.userId || members[0].userId !== targetPerson.userId)) return null;
    if (targetPerson.userId) {
      const user = await ctx.db.get(targetPerson.userId);
      if (!user || user.isDeleted) return null;
    }
  }
  return { purpose, organization, ...inviterData };
}
