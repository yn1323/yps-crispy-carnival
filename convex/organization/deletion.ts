import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasUnfinishedShopCleanupForOrganization } from "../deletionCleanup/service";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export type OrganizationDeletionEligibility =
  | { canDelete: true }
  | { canDelete: false; reason: string; code: "manager" | "billing" | "cleanup" };

export async function getOrganizationDeletionEligibility(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    actorMemberId: Id<"organizationMembers">;
    billingState: Doc<"organizationBillingStates"> | null;
  },
): Promise<OrganizationDeletionEligibility> {
  const [activeMembers, readOnlyMembers] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active"),
      )
      .take(2),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "readOnly"),
      )
      .first(),
  ]);
  if (activeMembers.length !== 1 || activeMembers[0]._id !== args.actorMemberId || readOnlyMembers) {
    return {
      canDelete: false,
      code: "manager",
      reason: "ほかの管理者を整理してからグループを削除してください。",
    };
  }

  if (!args.billingState || !isOrganizationBillingStateDeletable(args.billingState.state)) {
    return {
      canDelete: false,
      code: "billing",
      reason: "有料契約やプラン変更を終了してからグループを削除してください。",
    };
  }

  if (await hasUnfinishedShopCleanupForOrganization(ctx, args.organizationId)) {
    return {
      canDelete: false,
      code: "cleanup",
      reason: "店舗の削除処理が完了してから、もう一度お試しください。",
    };
  }

  return { canDelete: true };
}

export function isOrganizationBillingStateDeletable(state: Doc<"organizationBillingStates">["state"]) {
  return (
    (state.kind === "trial" && state.selectedPaidPlan === undefined) ||
    (state.kind === "active" && state.plan === "free") ||
    state.kind === "complimentary"
  );
}
