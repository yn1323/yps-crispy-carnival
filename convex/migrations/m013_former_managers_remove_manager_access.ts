import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  FORMER_MANAGER_ACCESS_CONFLICT_CODES,
  FORMER_MANAGER_ACCESS_OWNED_CONFLICT_CODES,
  getLegacyMembershipsToDeactivate,
  hasRemainingActiveManager,
  isValidManagerRelationship,
  removeFormerManagerAccess,
} from "../organization/migrations";
import { deriveOrganizationBillingPolicy, getEffectiveRestrictedBillingState } from "../organizationBilling/policy";
import {
  collectLinkedInvitationsByOrganization,
  getOrganizationInvitationLinkedAt,
  getOrganizationInvitationLinkedByPersonId,
} from "../organizationInvitation/lifecycle";
import { getOrganizationInvitationPurpose } from "../organizationInvitation/purpose";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const M012_OWNED_CONFLICT_CODES = new Set([
  "complimentary_business_missing_source_shop",
  "complimentary_business_source_shop_organization_mismatch",
  "complimentary_business_ambiguous_source_organization",
  "complimentary_business_existing_billing_state",
  "complimentary_business_ambiguous_billing_states",
]);

type MigrationCtx = Pick<MutationCtx, "db"> & MutationCtx;
type Evidence =
  | { kind: "currentFree"; successorPersonId: Id<"organizationPeople"> }
  | { kind: "freeManagerExchange"; successorPersonId: Id<"organizationPeople">; occurredAt: number }
  | { kind: "freeApplication"; successorPersonId: Id<"organizationPeople">; occurredAt: number };

async function recordConflict(
  ctx: Pick<MutationCtx, "db">,
  member: Doc<"organizationMembers">,
  code: (typeof FORMER_MANAGER_ACCESS_CONFLICT_CODES)[keyof typeof FORMER_MANAGER_ACCESS_CONFLICT_CODES],
) {
  await recordOrganizationMigrationConflict(ctx, {
    organizationId: member.organizationId,
    sourceType: "organizationMember",
    sourceId: member._id,
    code,
  });
}

async function m012GateIsComplete(
  ctx: Pick<MutationCtx, "db">,
  organization: Doc<"organizations">,
  billingState: Doc<"organizationBillingStates">,
) {
  if (!organization.migrationSourceShopId) return true;
  // 移行元グループは、m012/m022が作るcanonicalなcomplimentary状態を確認できる場合だけ処理する。
  if (billingState.state.kind !== "complimentary") return false;
  const unresolved = await ctx.db
    .query("organizationMigrationConflicts")
    .withIndex("by_organizationId_and_resolvedAt", (q) =>
      q.eq("organizationId", organization._id).eq("resolvedAt", undefined),
    )
    .collect();
  return !unresolved.some((conflict) => M012_OWNED_CONFLICT_CODES.has(conflict.code));
}

async function getFreeManagerExchangeEvidence(
  ctx: Pick<MutationCtx, "db">,
  member: Doc<"organizationMembers">,
): Promise<{ evidence: Evidence | null; conflicted: boolean }> {
  const invitations = (await collectLinkedInvitationsByOrganization(ctx, member.organizationId)).filter(
    (invitation) => invitation.inviterMemberId === member._id,
  );
  const exchangeInvitations = invitations.filter(
    (invitation) => getOrganizationInvitationPurpose(invitation) === "freeManagerExchange",
  );
  const valid: { invitation: Doc<"organizationInvitations">; occurredAt: number }[] = [];
  let malformed = false;

  for (const invitation of exchangeInvitations) {
    const linkedAt = getOrganizationInvitationLinkedAt(invitation);
    const linkedByPersonId = getOrganizationInvitationLinkedByPersonId(invitation);
    if (
      linkedAt === undefined ||
      linkedByPersonId === undefined ||
      linkedByPersonId === member.personId ||
      invitation.version < 1
    ) {
      malformed = true;
      continue;
    }
    const correlationId = `${invitation._id}:free-manager-exchange:${invitation.version - 1}`;
    const audits = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .take(2);
    if (
      audits.length !== 1 ||
      audits[0].organizationId !== member.organizationId ||
      audits[0].action !== "organization.free_selection_changed" ||
      audits[0].fromState !== `manager:${member.personId}` ||
      audits[0].toState !== `manager:${linkedByPersonId}` ||
      audits[0].occurredAt !== linkedAt
    ) {
      malformed = true;
      continue;
    }
    valid.push({ invitation, occurredAt: linkedAt });
  }

  if (malformed || valid.length > 1) return { evidence: null, conflicted: true };
  if (valid.length === 0) return { evidence: null, conflicted: false };
  const match = valid[0];
  if (member.updatedAt !== match.occurredAt) return { evidence: null, conflicted: true };

  const acceptedInvitations = await collectLinkedInvitationsByOrganization(ctx, member.organizationId);
  const laterManagerAddition = acceptedInvitations.some((invitation) => {
    const linkedByPersonId = getOrganizationInvitationLinkedByPersonId(invitation);
    const linkedAt = getOrganizationInvitationLinkedAt(invitation);
    return (
      getOrganizationInvitationPurpose(invitation) === "managerAddition" &&
      linkedByPersonId === member.personId &&
      (linkedAt ?? 0) > match.occurredAt
    );
  });
  if (laterManagerAddition) return { evidence: null, conflicted: true };

  return {
    evidence: {
      kind: "freeManagerExchange",
      successorPersonId: getOrganizationInvitationLinkedByPersonId(match.invitation) as Id<"organizationPeople">,
      occurredAt: match.occurredAt,
    },
    conflicted: false,
  };
}

async function getFreeApplicationEvidence(
  ctx: Pick<MutationCtx, "db">,
  member: Doc<"organizationMembers">,
  billingState: Doc<"organizationBillingStates">,
): Promise<{ evidence: Evidence | null; conflicted: boolean }> {
  if (!billingState.freeManagerPersonId || billingState.freeManagerPersonId === member.personId) {
    return { evidence: null, conflicted: false };
  }
  const sameTimestampAudits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_organizationId_and_occurredAt", (q) =>
      q.eq("organizationId", member.organizationId).eq("occurredAt", member.updatedAt),
    )
    .collect();
  const freeAppliedAudits = sameTimestampAudits.filter(
    (audit) =>
      audit.action === "organization.billing_state_changed" &&
      audit.targetId === billingState._id &&
      audit.toState === "free",
  );
  if (freeAppliedAudits.length > 1) return { evidence: null, conflicted: true };
  if (freeAppliedAudits.length === 0) return { evidence: null, conflicted: false };

  const recentAudits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_organizationId_and_occurredAt", (q) =>
      q.eq("organizationId", member.organizationId).lte("occurredAt", member.updatedAt),
    )
    .order("desc")
    .take(200);
  const freeSelectionAudits = recentAudits.filter(
    (audit) => audit.action === "organization.free_selection_changed" && audit.targetId === billingState._id,
  );
  if (freeSelectionAudits.length === 0) return { evidence: null, conflicted: true };

  return {
    evidence: {
      kind: "freeApplication",
      successorPersonId: billingState.freeManagerPersonId,
      occurredAt: member.updatedAt,
    },
    conflicted: false,
  };
}

async function hasRemainingManagerForState(
  ctx: Pick<MutationCtx, "db">,
  member: Doc<"organizationMembers">,
  billingState: Doc<"organizationBillingStates">,
  evidence: Evidence,
) {
  const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
  if (restrictedState) {
    const allowedStatuses = new Set<Doc<"organizationMembers">["status"]>(["active", "readOnly"]);
    for (const personId of new Set(restrictedState.recoveryManagerPersonIds)) {
      if (personId === member.personId) continue;
      if (await isValidManagerRelationship(ctx, member.organizationId, personId, allowedStatuses)) return true;
    }
    return false;
  }
  if (evidence.kind !== "currentFree") {
    return await hasRemainingActiveManager(ctx, member.organizationId, member._id);
  }
  return await isValidManagerRelationship(
    ctx,
    member.organizationId,
    evidence.successorPersonId,
    new Set<Doc<"organizationMembers">["status"]>(["active"]),
  );
}

/** 一意なFree交代の証拠がある旧readOnly管理者だけをstaff/personへ戻す。 */
export const migration = migrations.define({
  table: "organizationMembers",
  batchSize: 10,
  migrateOne: async (ctx: MigrationCtx, member) => {
    if (member.status !== "readOnly") {
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "organizationMember",
        sourceId: member._id,
        codes: FORMER_MANAGER_ACCESS_OWNED_CONFLICT_CODES,
      });
      return;
    }
    const [organization, canonicalMembers, userMembers, billingStates] = await Promise.all([
      ctx.db.get(member.organizationId),
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
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", member.organizationId))
        .take(2),
    ]);
    if (!organization || organization.isDeleted) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.invalidCanonicalRelationship);
      return;
    }
    if (billingStates.length === 0) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.missingBillingState);
      return;
    }
    if (billingStates.length > 1) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.ambiguousBillingState);
      return;
    }
    const billingState = billingStates[0];
    if (!(await m012GateIsComplete(ctx, organization, billingState))) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.m012GateIncomplete);
      return;
    }
    if (
      canonicalMembers.length !== 1 ||
      canonicalMembers[0]._id !== member._id ||
      userMembers.length !== 1 ||
      userMembers[0]._id !== member._id ||
      !(await isValidManagerRelationship(
        ctx,
        member.organizationId,
        member.personId,
        new Set<Doc<"organizationMembers">["status"]>(["readOnly"]),
      ))
    ) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.invalidCanonicalRelationship);
      return;
    }

    const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
    const policy = deriveOrganizationBillingPolicy(billingState.state);
    if (restrictedState?.recoveryManagerPersonIds.includes(member.personId)) {
      await resolveOrganizationMigrationConflicts(ctx, {
        sourceType: "organizationMember",
        sourceId: member._id,
        codes: FORMER_MANAGER_ACCESS_OWNED_CONFLICT_CODES,
      });
      return;
    }
    const isReferencedFreeManager = billingState.freeManagerPersonId === member.personId;
    if (policy.entitlementPlan === "free" && isReferencedFreeManager) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.currentFreeSelectionInvalid);
      return;
    }

    let evidence: Evidence | null = null;
    if (policy.entitlementPlan === "free") {
      if (!billingState.freeManagerPersonId) {
        await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.currentFreeSelectionInvalid);
        return;
      }
      evidence = { kind: "currentFree", successorPersonId: billingState.freeManagerPersonId };
    } else {
      const exchange = await getFreeManagerExchangeEvidence(ctx, member);
      if (exchange.conflicted) {
        await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.historyConflict);
        return;
      }
      evidence = exchange.evidence;
      if (!evidence) {
        const freeApplication = await getFreeApplicationEvidence(ctx, member, billingState);
        if (freeApplication.conflicted) {
          await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.historyConflict);
          return;
        }
        evidence = freeApplication.evidence;
      }
    }

    if (!evidence) {
      await recordConflict(
        ctx,
        member,
        restrictedState
          ? FORMER_MANAGER_ACCESS_CONFLICT_CODES.restrictedOriginAmbiguous
          : FORMER_MANAGER_ACCESS_CONFLICT_CODES.originAmbiguous,
      );
      return;
    }
    if (isReferencedFreeManager) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.referencedFreeManager);
      return;
    }
    if (!(await hasRemainingManagerForState(ctx, member, billingState, evidence))) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.noRemainingManager);
      return;
    }
    const legacyMemberships = await getLegacyMembershipsToDeactivate(ctx, member);
    if (!legacyMemberships) {
      await recordConflict(ctx, member, FORMER_MANAGER_ACCESS_CONFLICT_CODES.ambiguousLegacyMembership);
      return;
    }

    const correlationId = `${member._id}:migration:m013:remove-manager-access:${member.updatedAt}`;
    await removeFormerManagerAccess(ctx, { member, correlationId, now: Date.now() });
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organizationMember",
      sourceId: member._id,
      codes: FORMER_MANAGER_ACCESS_OWNED_CONFLICT_CODES,
    });
  },
});
