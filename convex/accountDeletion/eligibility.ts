import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { sha256Hex } from "../_lib/sha256";
import { getOrganizationDeletionEligibility } from "../organization/deletion";
import {
  type AccountDeletionOrganizationActor,
  type AccountDeletionOrganizationDeparturePlan,
  classifyAccountDeletionOrganizationDepartureError,
  prepareAccountDeletionOrganizationDeparture,
} from "../organization/mutations";
import { getOrganizationBillingState, getValidActiveOrganizationManagerPersonIds } from "../organization/service";

const ASSOCIATION_SCAN_LIMIT = 100;

type AccountDeletionReadCtx = { db: GenericDatabaseReader<DataModel> };

export type AccountDeletionBlockedReason =
  | "multipleOrganizations"
  | "organizationDeletionUnavailable"
  | "tooManyAssociatedRecords"
  | "tooManyFutureAssignments"
  | "inconsistentAssociation"
  | "providerConfigurationUnavailable"
  | "deletionAlreadyRequested"
  | "unavailable";

type AccountOnlyPlan = {
  status: "ready";
  action: "accountOnly";
  previewFingerprint: string;
};

type OrganizationPlanBase = {
  status: "ready";
  actor: AccountDeletionOrganizationActor;
  organization: { name: string; shopCount: number };
  previewFingerprint: string;
};

export type LeaveOrganizationPlan = OrganizationPlanBase & {
  action: "leaveOrganization";
  futureAssignmentCount: number;
  departurePlan: AccountDeletionOrganizationDeparturePlan;
};

export type DeleteOrganizationPlan = OrganizationPlanBase & {
  action: "deleteOrganization";
};

export type AccountDeletionPlan =
  | AccountOnlyPlan
  | LeaveOrganizationPlan
  | DeleteOrganizationPlan
  | { status: "blocked"; reason: AccountDeletionBlockedReason };

export async function getAccountDeletionPlan(
  ctx: AccountDeletionReadCtx,
  args: { user: Doc<"users"> | null; authTokenIdentifier: string; asOfDate: string },
): Promise<AccountDeletionPlan> {
  if (!args.user) {
    return {
      status: "ready",
      action: "accountOnly",
      previewFingerprint: await fingerprint({ version: 1, action: "accountOnly", auth: args.authTokenIdentifier }),
    };
  }
  if (args.user.isDeleted || args.user.accountDeletionRequestedAt !== undefined) {
    return { status: "blocked", reason: "deletionAlreadyRequested" };
  }

  try {
    return await derivePlanForExistingUser(ctx, args.user, args.asOfDate);
  } catch {
    // 重複indexやdangling referenceを削除対象として推測しない。
    return { status: "blocked", reason: "inconsistentAssociation" };
  }
}

export function toPublicAccountDeletionPreview(plan: AccountDeletionPlan) {
  if (plan.status === "blocked") return plan;
  if (plan.action === "accountOnly") return plan;
  if (plan.action === "leaveOrganization") {
    return {
      status: plan.status,
      action: plan.action,
      previewFingerprint: plan.previewFingerprint,
      organization: plan.organization,
      futureAssignmentCount: plan.futureAssignmentCount,
    };
  }
  return {
    status: plan.status,
    action: plan.action,
    previewFingerprint: plan.previewFingerprint,
    organization: plan.organization,
  };
}

async function derivePlanForExistingUser(
  ctx: AccountDeletionReadCtx,
  user: Doc<"users">,
  asOfDate: string,
): Promise<AccountDeletionPlan> {
  const [activeMembers, readOnlyMembers, removedMembers, activePeople, activeStaffs, activeShopMembers] =
    await Promise.all([
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", "active"))
        .take(ASSOCIATION_SCAN_LIMIT + 1),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", "readOnly"))
        .take(ASSOCIATION_SCAN_LIMIT + 1),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", "removed"))
        .take(ASSOCIATION_SCAN_LIMIT + 1),
      ctx.db
        .query("organizationPeople")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", "active"))
        .take(ASSOCIATION_SCAN_LIMIT + 1),
      ctx.db
        .query("staffs")
        .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
        .take(ASSOCIATION_SCAN_LIMIT + 1),
      ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
        .take(ASSOCIATION_SCAN_LIMIT + 1),
    ]);
  if (
    [activeMembers, readOnlyMembers, removedMembers, activePeople, activeStaffs, activeShopMembers].some(
      (rows) => rows.length > ASSOCIATION_SCAN_LIMIT,
    )
  ) {
    return { status: "blocked", reason: "inconsistentAssociation" };
  }

  const organizationIds = new Set<Id<"organizations">>();
  for (const member of [...activeMembers, ...readOnlyMembers]) {
    const [organization, person] = await Promise.all([ctx.db.get(member.organizationId), ctx.db.get(member.personId)]);
    if (
      !organization ||
      organization.isDeleted ||
      !person ||
      person.organizationId !== organization._id ||
      person.userId !== user._id ||
      person.status !== "active"
    ) {
      return { status: "blocked", reason: "inconsistentAssociation" };
    }
    organizationIds.add(organization._id);
  }
  for (const person of activePeople) {
    const organization = await ctx.db.get(person.organizationId);
    if (!organization || organization.isDeleted || person.userId !== user._id) {
      return { status: "blocked", reason: "inconsistentAssociation" };
    }
    organizationIds.add(organization._id);
  }
  for (const staff of activeStaffs) {
    const [shop, person] = await Promise.all([
      ctx.db.get(staff.shopId),
      staff.organizationPersonId ? ctx.db.get(staff.organizationPersonId) : null,
    ]);
    if (
      !staff.organizationId ||
      !shop ||
      shop.isDeleted ||
      shop.organizationId !== staff.organizationId ||
      !person ||
      person.organizationId !== staff.organizationId ||
      person.userId !== user._id ||
      person.status !== "active"
    ) {
      return { status: "blocked", reason: "inconsistentAssociation" };
    }
    const organization = await ctx.db.get(staff.organizationId);
    if (!organization || organization.isDeleted) {
      return { status: "blocked", reason: "inconsistentAssociation" };
    }
    organizationIds.add(organization._id);
  }
  for (const membership of activeShopMembers) {
    const shop = await ctx.db.get(membership.shopId);
    if (!shop || shop.isDeleted || !shop.organizationId) {
      return { status: "blocked", reason: "inconsistentAssociation" };
    }
    const organization = await ctx.db.get(shop.organizationId);
    if (!organization || organization.isDeleted) {
      return { status: "blocked", reason: "inconsistentAssociation" };
    }
    organizationIds.add(organization._id);
  }

  if (organizationIds.size === 0) {
    return {
      status: "ready",
      action: "accountOnly",
      previewFingerprint: await fingerprint({ version: 1, action: "accountOnly", userId: user._id }),
    };
  }
  if (organizationIds.size > 1) return { status: "blocked", reason: "multipleOrganizations" };
  if (readOnlyMembers.length !== 0 || activePeople.length !== 1 || activeMembers.length > 1) {
    return { status: "blocked", reason: "inconsistentAssociation" };
  }

  const organizationId = [...organizationIds][0];
  if (!organizationId) return { status: "blocked", reason: "inconsistentAssociation" };
  const activePerson = activePeople[0];
  const matchingRemovedMembers = removedMembers.filter(
    (candidate) => candidate.organizationId === organizationId && candidate.personId === activePerson._id,
  );
  const member = activeMembers[0] ?? (matchingRemovedMembers.length === 1 ? matchingRemovedMembers[0] : null);
  if (!member) return { status: "blocked", reason: "inconsistentAssociation" };
  const associationKind = member.status === "active" ? "activeManager" : "formerManager";
  if (
    (associationKind === "activeManager" && activeMembers.length !== 1) ||
    (associationKind === "formerManager" && (activeMembers.length !== 0 || matchingRemovedMembers.length !== 1))
  ) {
    return { status: "blocked", reason: "inconsistentAssociation" };
  }
  const [organization, person] = await Promise.all([ctx.db.get(organizationId), ctx.db.get(member.personId)]);
  if (
    !organization ||
    organization.isDeleted ||
    !person ||
    activePerson._id !== person._id ||
    member.organizationId !== organization._id ||
    member.userId !== user._id ||
    member.personId !== person._id ||
    person.organizationId !== organization._id ||
    person.userId !== user._id
  ) {
    return { status: "blocked", reason: "inconsistentAssociation" };
  }
  if (activeStaffs.some((staff) => staff.organizationPersonId !== person._id)) {
    return { status: "blocked", reason: "inconsistentAssociation" };
  }

  const actor = { organization, person, member } satisfies AccountDeletionOrganizationActor;
  const [billingState, validManagerPersonIds, shops] = await Promise.all([
    getOrganizationBillingState(ctx, organization._id),
    getValidActiveOrganizationManagerPersonIds(ctx, organization._id),
    ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_isDeleted", (q) =>
        q.eq("organizationId", organization._id).eq("isDeleted", false),
      )
      .take(ASSOCIATION_SCAN_LIMIT + 1),
  ]);
  if (
    !billingState ||
    shops.length > ASSOCIATION_SCAN_LIMIT ||
    (associationKind === "activeManager" && !validManagerPersonIds.includes(person._id)) ||
    (associationKind === "formerManager" && validManagerPersonIds.includes(person._id))
  ) {
    return { status: "blocked", reason: "inconsistentAssociation" };
  }

  const otherManagerPersonIds = validManagerPersonIds.filter((personId) => personId !== person._id).sort();
  const organizationSummary = { name: organization.name, shopCount: shops.length };
  if (otherManagerPersonIds.length > 0) {
    let departurePlan: AccountDeletionOrganizationDeparturePlan;
    try {
      departurePlan = await prepareAccountDeletionOrganizationDeparture(ctx, {
        actor,
        accountUserId: user._id,
        asOfDate,
      });
    } catch (error) {
      const reason = classifyAccountDeletionOrganizationDepartureError(error);
      if (reason) return { status: "blocked", reason };
      return { status: "blocked", reason: "organizationDeletionUnavailable" };
    }
    if (departurePlan.removalPreview.kind === "tooMany") {
      return { status: "blocked", reason: "tooManyFutureAssignments" };
    }
    const previewFingerprint = await fingerprint({
      version: 1,
      action: "leaveOrganization",
      associationKind,
      userId: user._id,
      organizationId: organization._id,
      organizationUpdatedAt: organization.updatedAt,
      personId: person._id,
      personUpdatedAt: person.updatedAt,
      memberId: member._id,
      memberStatus: member.status,
      memberUpdatedAt: member.updatedAt,
      billingStateId: billingState._id,
      billingVersion: billingState.version,
      otherManagerPersonIds,
      shopIds: shops.map((shop) => shop._id).sort(),
      staffIds: departurePlan.removalPlan.staffIds.slice().sort(),
      invitationIds: departurePlan.removalPlan.invitations.map((invitation) => invitation._id).sort(),
      assignmentFingerprint: departurePlan.removalPreview.fingerprint,
    });
    return {
      status: "ready",
      action: "leaveOrganization",
      actor,
      organization: organizationSummary,
      departurePlan,
      futureAssignmentCount: departurePlan.removalPreview.assignmentCount,
      previewFingerprint,
    };
  }

  if (associationKind === "formerManager") {
    return { status: "blocked", reason: "inconsistentAssociation" };
  }

  const eligibility = await getOrganizationDeletionEligibility(ctx, {
    organizationId: organization._id,
    actorMemberId: member._id,
    billingState,
  });
  if (!eligibility.canDelete) return { status: "blocked", reason: "organizationDeletionUnavailable" };
  return {
    status: "ready",
    action: "deleteOrganization",
    actor,
    organization: organizationSummary,
    previewFingerprint: await fingerprint({
      version: 1,
      action: "deleteOrganization",
      userId: user._id,
      organizationId: organization._id,
      organizationUpdatedAt: organization.updatedAt,
      personId: person._id,
      personUpdatedAt: person.updatedAt,
      memberId: member._id,
      memberStatus: member.status,
      memberUpdatedAt: member.updatedAt,
      billingStateId: billingState._id,
      billingVersion: billingState.version,
      shopIds: shops.map((shop) => shop._id).sort(),
    }),
  };
}

async function fingerprint(value: unknown) {
  return await sha256Hex(JSON.stringify(value));
}
