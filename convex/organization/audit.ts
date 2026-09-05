import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAnalyticsUsage } from "../analytics/record";

export type OrganizationAuditAction =
  | "organization.created"
  | "organization.deleted"
  | "organization.name_changed"
  | "organization.billing_email_changed"
  | "organization.shop_added"
  | "organization.shop_deleted"
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
  if (args.action === "organization.shop_added" && args.targetKind === "shop" && args.targetId) {
    await recordAnalyticsUsage(ctx, { shopId: args.targetId as Id<"shops">, metric: "registered" });
  }
  return auditEventId;
}
