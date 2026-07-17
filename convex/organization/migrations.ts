import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { cancelOrganizationRecipientBusinessNotifications } from "../notificationOutbox/mutations";
import { getEffectiveRestrictedBillingState } from "../organizationBilling/policy";
import { recordOrganizationAuditEvent } from "./audit";

export const FORMER_MANAGER_ACCESS_CONFLICT_CODES = {
  m012GateIncomplete: "former_manager_m012_gate_incomplete",
  missingBillingState: "former_manager_missing_billing_state",
  ambiguousBillingState: "former_manager_ambiguous_billing_state",
  invalidCanonicalRelationship: "former_manager_invalid_canonical_relationship",
  currentFreeSelectionInvalid: "former_manager_current_free_selection_invalid",
  historyConflict: "former_manager_history_conflict",
  originAmbiguous: "former_manager_origin_ambiguous",
  restrictedOriginAmbiguous: "restricted_read_only_origin_ambiguous",
  noRemainingManager: "former_manager_no_remaining_manager",
  ambiguousLegacyMembership: "former_manager_ambiguous_legacy_shop_membership",
  referencedFreeManager: "former_manager_still_referenced_as_free_manager",
} as const;

export const FORMER_MANAGER_ACCESS_OWNED_CONFLICT_CODES = Object.values(FORMER_MANAGER_ACCESS_CONFLICT_CODES);

const billingStateKindValidator = v.union(
  v.literal("trial"),
  v.literal("initialPaymentPending"),
  v.literal("pendingActivation"),
  v.literal("active"),
  v.literal("complimentary"),
  v.literal("scheduledChange"),
  v.literal("grace"),
  v.literal("restricted"),
);

const decisionValidator = v.union(v.literal("removeManagerAccess"), v.literal("keepAuthorizedReadOnly"));
const reasonCodeValidator = v.union(v.literal("formerManagerConfirmed"), v.literal("restrictedRecoveryManager"));

type OrganizationMutationCtx = Pick<MutationCtx, "db"> & MutationCtx;

async function getCanonicalRelationship(ctx: Pick<MutationCtx, "db">, member: Doc<"organizationMembers">) {
  const [person, user, personMembers, userMembers] = await Promise.all([
    ctx.db.get(member.personId),
    ctx.db.get(member.userId),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", member.organizationId).eq("personId", member.personId),
      )
      .take(2),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", member.userId).eq("organizationId", member.organizationId),
      )
      .take(2),
  ]);

  if (
    !person ||
    person.organizationId !== member.organizationId ||
    person.status !== "active" ||
    person.userId !== member.userId ||
    !user ||
    user.isDeleted ||
    personMembers.length !== 1 ||
    personMembers[0]._id !== member._id ||
    userMembers.length !== 1 ||
    userMembers[0]._id !== member._id
  ) {
    return null;
  }

  return { person, user };
}

export async function isValidManagerRelationship(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
  allowedStatuses: ReadonlySet<Doc<"organizationMembers">["status"]>,
) {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_personId", (q) => q.eq("organizationId", organizationId).eq("personId", personId))
    .take(2);
  if (members.length !== 1 || !allowedStatuses.has(members[0].status)) return false;
  return (await getCanonicalRelationship(ctx, members[0])) !== null;
}

export async function hasRemainingActiveManager(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
  excludedMemberId: Id<"organizationMembers">,
) {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .collect();
  for (const member of members) {
    if (member._id === excludedMemberId) continue;
    if (await isValidManagerRelationship(ctx, organizationId, member.personId, new Set(["active"]))) return true;
  }
  return false;
}

async function hasRemainingRecoveryManager(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
  excludedPersonId: Id<"organizationPeople">,
  recoveryManagerPersonIds: readonly Id<"organizationPeople">[],
) {
  const allowedStatuses = new Set<Doc<"organizationMembers">["status"]>(["active", "readOnly"]);
  for (const personId of new Set(recoveryManagerPersonIds)) {
    if (personId === excludedPersonId) continue;
    if (await isValidManagerRelationship(ctx, organizationId, personId, allowedStatuses)) return true;
  }
  return false;
}

export async function getLegacyMembershipsToDeactivate(
  ctx: Pick<MutationCtx, "db">,
  member: Doc<"organizationMembers">,
) {
  const shops = await ctx.db
    .query("shops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", member.organizationId))
    .collect();
  const memberships: Doc<"shopMembers">[] = [];
  for (const shop of shops) {
    const candidates = await ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_shopId", (q) => q.eq("userId", member.userId).eq("shopId", shop._id))
      .take(2);
    if (candidates.length > 1) return null;
    if (candidates[0] && !candidates[0].isDeleted) memberships.push(candidates[0]);
  }
  return memberships;
}

async function getPendingInvitationsIssuedByMember(ctx: Pick<MutationCtx, "db">, member: Doc<"organizationMembers">) {
  return await ctx.db
    .query("organizationInvitations")
    .withIndex("by_inviterMemberId_and_status", (q) => q.eq("inviterMemberId", member._id).eq("status", "pending"))
    .collect();
}

/** migrationと手動裁定で共有する、スタッフ所属を残した管理権限解除。 */
export async function removeFormerManagerAccess(
  ctx: OrganizationMutationCtx,
  args: {
    member: Doc<"organizationMembers">;
    correlationId: string;
    now: number;
  },
) {
  const existingAudits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
    .take(2);
  if (existingAudits.length > 1) throw new ConvexError("移行監査を一意に確認できません");
  if (existingAudits.length === 1) return false;
  if (args.member.status !== "readOnly") throw new ConvexError("移行対象の管理者状態が変わりました");
  if (!(await getCanonicalRelationship(ctx, args.member))) {
    throw new ConvexError("移行対象の所属を一意に確認できません");
  }

  const [resolvedLegacyMemberships, invitations, staffs] = await Promise.all([
    getLegacyMembershipsToDeactivate(ctx, args.member),
    getPendingInvitationsIssuedByMember(ctx, args.member),
    ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", args.member.organizationId).eq("organizationPersonId", args.member.personId),
      )
      .collect(),
  ]);
  if (!resolvedLegacyMemberships) throw new ConvexError("移行対象の旧所属を一意に確認できません");

  await ctx.db.patch(args.member._id, { status: "removed", updatedAt: args.now });
  for (const membership of resolvedLegacyMemberships) {
    await ctx.db.patch(membership._id, { isDeleted: true });
  }
  for (const invitation of invitations) {
    await ctx.db.patch(invitation._id, {
      status: "revoked",
      reservedSeat: false,
      version: invitation.version + 1,
      revokedAt: args.now,
      updatedAt: args.now,
    });
  }
  await cancelOrganizationRecipientBusinessNotifications(ctx, {
    organizationId: args.member.organizationId,
    userId: args.member.userId,
    invitationIds: invitations.map((invitation) => invitation._id),
    includeBillingUserNotifications: true,
    preserveStaffNotificationsForUser: true,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: args.member.organizationId,
    action: "organization.manager_role_removed",
    targetKind: "person",
    targetId: args.member.personId,
    fromState: "readOnly",
    toState: staffs.some((staff) => !staff.isDeleted) ? "staffOnly" : "personOnly",
    correlationId: args.correlationId,
    occurredAt: args.now,
  });
  return true;
}

function arbitrationError() {
  return new ConvexError("移行裁定の前提が変わりました");
}

export const resolveFormerManagerAccessConflict = internalMutation({
  args: {
    conflictId: v.id("organizationMigrationConflicts"),
    organizationMemberId: v.id("organizationMembers"),
    expectedUpdatedAt: v.number(),
    expectedBillingVersion: v.number(),
    expectedBillingStateKind: billingStateKindValidator,
    decision: decisionValidator,
    reasonCode: reasonCodeValidator,
    requestId: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const requestKey = await toAuditRequestKey(args.requestId);
    const correlationId =
      args.decision === "keepAuthorizedReadOnly"
        ? `${args.conflictId}:manager-access-reviewed:${args.expectedUpdatedAt}:${args.expectedBillingVersion}`
        : `${args.conflictId}:manager-access-removed:${args.expectedUpdatedAt}:${args.expectedBillingVersion}:${requestKey}`;
    const priorAudits = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .take(2);
    if (priorAudits.length === 1) return { changed: false };
    if (priorAudits.length > 1) throw arbitrationError();

    const [conflict, member] = await Promise.all([ctx.db.get(args.conflictId), ctx.db.get(args.organizationMemberId)]);
    if (
      !conflict ||
      conflict.resolvedAt !== undefined ||
      conflict.sourceType !== "organizationMember" ||
      conflict.sourceId !== args.organizationMemberId ||
      !FORMER_MANAGER_ACCESS_OWNED_CONFLICT_CODES.includes(
        conflict.code as (typeof FORMER_MANAGER_ACCESS_OWNED_CONFLICT_CODES)[number],
      ) ||
      !member ||
      member.status !== "readOnly" ||
      member.updatedAt !== args.expectedUpdatedAt ||
      conflict.organizationId !== member.organizationId ||
      !(await getCanonicalRelationship(ctx, member))
    ) {
      throw arbitrationError();
    }

    const billingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", member.organizationId))
      .take(2);
    if (
      billingStates.length !== 1 ||
      billingStates[0].version !== args.expectedBillingVersion ||
      billingStates[0].state.kind !== args.expectedBillingStateKind
    ) {
      throw arbitrationError();
    }
    const billingState = billingStates[0];
    const restrictedState = getEffectiveRestrictedBillingState(billingState.state);

    if (args.decision === "keepAuthorizedReadOnly") {
      if (
        args.reasonCode !== "restrictedRecoveryManager" ||
        !restrictedState?.recoveryManagerPersonIds.includes(member.personId)
      ) {
        throw arbitrationError();
      }
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: member.organizationId,
        action: "organization.manager_access_reviewed",
        targetKind: "person",
        targetId: member.personId,
        fromState: `readOnly:${billingState.state.kind}:v${billingState.version}`,
        toState: `authorizedReadOnly:${args.reasonCode}`,
        correlationId,
        occurredAt: Date.now(),
      });
      await ctx.db.patch(conflict._id, { resolvedAt: Date.now() });
      return { changed: true };
    }

    if (
      args.reasonCode !== "formerManagerConfirmed" ||
      billingState.freeManagerPersonId === member.personId ||
      restrictedState?.recoveryManagerPersonIds.includes(member.personId)
    ) {
      throw arbitrationError();
    }
    const hasRemainingManager = restrictedState
      ? await hasRemainingRecoveryManager(
          ctx,
          member.organizationId,
          member.personId,
          restrictedState.recoveryManagerPersonIds,
        )
      : await hasRemainingActiveManager(ctx, member.organizationId, member._id);
    if (!hasRemainingManager) throw arbitrationError();

    const now = Date.now();
    await removeFormerManagerAccess(ctx, { member, correlationId, now });
    await ctx.db.patch(conflict._id, { resolvedAt: now });
    return { changed: true };
  },
});
