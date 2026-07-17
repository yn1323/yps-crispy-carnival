import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type OrganizationAuditAction =
  | "organization.created"
  | "organization.name_changed"
  | "organization.billing_email_changed"
  | "organization.shop_added"
  | "organization.shop_archived"
  | "organization.shop_deleted"
  | "organization.shop_reactivated"
  | "organization.person_removed_from_shop"
  | "organization.person_removed"
  | "organization.person_reactivated"
  | "organization.staff_added"
  | "organization.manager_role_removed"
  | "organization.recovery_managers_changed"
  | "organization.manager_invited"
  | "organization.manager_invitation_resent"
  | "organization.manager_invitation_revoked"
  | "organization.manager_invitation_accepted"
  | "organization.free_selection_changed"
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
  },
) {
  return await ctx.db.insert("organizationAuditEvents", {
    organizationId: args.organizationId,
    actorUserId: args.actorUserId,
    actorPersonId: args.actorPersonId,
    action: args.action,
    targetKind: args.targetKind,
    targetId: args.targetId,
    fromState: args.fromState,
    toState: args.toState,
    correlationId: args.correlationId,
    occurredAt: args.occurredAt ?? Date.now(),
  });
}
