import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AnalyticsSourceEventInput } from "../analytics/sourceEvents";
import { analyticsPlanForBillingState, appendAnalyticsSourceEventForNewAudit } from "../analytics/sourceEvents";

export type OrganizationAuditAction =
  | "organization.created"
  | "organization.deleted"
  | "organization.name_changed"
  | "organization.billing_email_changed"
  | "organization.shop_added"
  | "organization.shop_archived"
  | "organization.shop_deleted"
  | "organization.shop_reactivated"
  | "organization.person_removed_from_shop"
  | "organization.person_shop_memberships_changed"
  | "organization.shop_staff_memberships_changed"
  | "organization.person_removed"
  | "organization.person_reactivated"
  | "organization.person_profile_updated"
  | "organization.person_line_disconnected"
  | "organization.account_email_synced"
  | "organization.staff_added"
  | "organization.manager_role_removed"
  | "organization.manager_invited"
  | "organization.manager_invitation_resent"
  | "organization.manager_invitation_revoked"
  | "organization.manager_invitation_accepted"
  | "organization.manager_invitation_linked"
  | "organization.staff_registration_link_rotated"
  | "organization.free_selection_changed"
  | "organization.billing_grace_shortened"
  | "organization.billing_state_changed";

export async function recordOrganizationAuditEvent(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    actorUserId?: Id<"users">;
    actorPersonId?: Id<"organizationPeople">;
    action: OrganizationAuditAction;
    targetKind?: "organization" | "shop" | "person" | "staff" | "invitation" | "billing";
    targetId?: string;
    fromState?: string;
    toState?: string;
    correlationId?: string;
    occurredAt?: number;
    analyticsEvent?: Omit<AnalyticsSourceEventInput, "eventKey" | "occurredAt" | "organizationId">;
    suppressAnalyticsEvent?: boolean;
  },
) {
  const occurredAt = args.occurredAt ?? Date.now();
  const auditEventId = await ctx.db.insert("organizationAuditEvents", {
    organizationId: args.organizationId,
    actorUserId: args.actorUserId,
    actorPersonId: args.actorPersonId,
    action: args.action,
    targetKind: args.targetKind,
    targetId: args.targetId,
    fromState: args.fromState,
    toState: args.toState,
    correlationId: args.correlationId,
    occurredAt,
  });
  const inferredAnalyticsEvent =
    args.analyticsEvent || args.suppressAnalyticsEvent ? undefined : await inferAnalyticsEvent(ctx, args, occurredAt);
  const analyticsEvent = args.suppressAnalyticsEvent ? undefined : (args.analyticsEvent ?? inferredAnalyticsEvent);
  if (analyticsEvent) {
    await appendAnalyticsSourceEventForNewAudit(ctx, {
      ...analyticsEvent,
      eventKey: `organizationAudit:${auditEventId}`,
      organizationId: args.organizationId,
      occurredAt,
    });
  }
  return auditEventId;
}

async function inferAnalyticsEvent(
  ctx: MutationCtx,
  args: Parameters<typeof recordOrganizationAuditEvent>[1],
  occurredAt: number,
): Promise<Omit<AnalyticsSourceEventInput, "eventKey" | "occurredAt" | "organizationId"> | undefined> {
  if (args.action === "organization.name_changed") {
    return {
      eventType: "organization.changed",
      payload: { kind: "organization", change: "updated", ...(args.toState ? { displayName: args.toState } : {}) },
    };
  }
  if (args.action === "organization.deleted") {
    return { eventType: "organization.changed", payload: { kind: "organization", change: "deleted" } };
  }
  if (
    args.targetKind === "shop" &&
    args.targetId &&
    [
      "organization.shop_added",
      "organization.shop_archived",
      "organization.shop_reactivated",
      "organization.shop_deleted",
    ].includes(args.action)
  ) {
    const change =
      args.action === "organization.shop_added"
        ? "created"
        : args.action === "organization.shop_archived"
          ? "archived"
          : args.action === "organization.shop_reactivated"
            ? "reactivated"
            : "deleted";
    return {
      eventType: "shop.changed",
      shopId: args.targetId as Id<"shops">,
      payload: {
        kind: "shop",
        change,
        ...(change === "created" ? { registeredAt: occurredAt } : {}),
      },
    };
  }
  if (
    args.targetKind === "person" &&
    args.targetId &&
    (args.action === "organization.person_removed" || args.action === "organization.person_reactivated")
  ) {
    const personId = args.targetId as Id<"organizationPeople">;
    return {
      eventType: "person.changed",
      subjectId: personId,
      payload: {
        kind: "person",
        status: args.action === "organization.person_removed" ? "removed" : "active",
        firstObservedAt: occurredAt,
      },
    };
  }
  if (args.action === "organization.manager_role_removed" && args.targetId) {
    const personId = args.targetId as Id<"organizationPeople">;
    return {
      eventType: "managerMembership.changed",
      subjectId: personId,
      payload: {
        kind: "managerMembership",
        personId,
        status: "removed",
        validFrom: occurredAt,
        validTo: occurredAt,
      },
    };
  }
  if (args.action === "organization.billing_state_changed") {
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!billing) return undefined;
    const plan = analyticsPlanForBillingState(billing.state);
    // planを確定できない中間状態ではeventを出さず、最後に確定した分析planを維持する。
    if (!plan) return undefined;
    return {
      eventType: "plan.changed",
      payload: {
        kind: "plan",
        plan,
        billingVersion: billing.version,
        effectiveAt: occurredAt,
        statusDeltas: [],
      },
    };
  }
  return undefined;
}
