import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasUnfinishedShopCleanupForOrganization } from "../deletionCleanup/service";
import { hasUniqueTerminalSubscriptionEvidence } from "../organizationStripe/subscriptionEvidence";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

const CREATE_TRIAL_OPERATION_PROOF_LIMIT = 32;
const CREATE_TRIAL_IN_FLIGHT_STATUSES = [
  "queued",
  "processing",
  "retrying",
] as const satisfies readonly Doc<"organizationStripeOperations">["status"][];
const CREATE_TRIAL_PROVIDER_OBJECT_STATUSES = [
  "succeeded",
  "actionRequired",
] as const satisfies readonly Doc<"organizationStripeOperations">["status"][];
const INVALID_TRIAL_CLEANUP_STATUSES = [
  "queued",
  "processing",
  "retrying",
  "succeeded",
  "failed",
  "actionRequired",
  "cancelled",
] as const satisfies readonly Doc<"organizationStripeOperations">["status"][];
const STRIPE_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const satisfies readonly Doc<"organizationStripeSubscriptions">["status"][];
const TERMINAL_STRIPE_SUBSCRIPTION_STATUSES = [
  "incomplete_expired",
  "canceled",
] as const satisfies readonly Doc<"organizationStripeSubscriptions">["status"][];

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
  const activeMembers = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) =>
      q.eq("organizationId", args.organizationId).eq("status", "active"),
    )
    .take(2);
  if (activeMembers.length !== 1 || activeMembers[0]._id !== args.actorMemberId) {
    return {
      canDelete: false,
      code: "manager",
      reason: "組織を削除するには、先にほかの管理者の権限を外してください。",
    };
  }

  if (!args.billingState || !isOrganizationBillingStateDeletable(args.billingState.state)) {
    return {
      canDelete: false,
      code: "billing",
      reason: "組織を削除するには、先に有料契約やプラン変更を終了してください。",
    };
  }

  if (await hasUnsafeStripeTrialSubscription(ctx, args.organizationId)) {
    return {
      canDelete: false,
      code: "billing",
      reason: "組織を削除するには、先にStripeの契約終了を確認してください。",
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

async function hasUnsafeStripeTrialSubscription(ctx: DbCtx, organizationId: Id<"organizations">) {
  const [currentSubscriptions, inFlightOperations] = await Promise.all([
    Promise.all(
      STRIPE_SUBSCRIPTION_STATUSES.map((status) =>
        TERMINAL_STRIPE_SUBSCRIPTION_STATUSES.includes(status as (typeof TERMINAL_STRIPE_SUBSCRIPTION_STATUSES)[number])
          ? ctx.db
              .query("organizationStripeSubscriptions")
              .withIndex("by_organizationId_and_status_and_terminalAt", (q) =>
                q.eq("organizationId", organizationId).eq("status", status).eq("terminalAt", undefined),
              )
              .first()
          : ctx.db
              .query("organizationStripeSubscriptions")
              .withIndex("by_organizationId_and_status_and_terminalAt", (q) =>
                q.eq("organizationId", organizationId).eq("status", status),
              )
              .first(),
      ),
    ),
    Promise.all(
      CREATE_TRIAL_IN_FLIGHT_STATUSES.map((status) =>
        ctx.db
          .query("organizationStripeOperations")
          .withIndex("by_organizationId_and_kind_and_status", (q) =>
            q.eq("organizationId", organizationId).eq("kind", "createTrialSubscription").eq("status", status),
          )
          .first(),
      ),
    ),
  ]);
  if (currentSubscriptions.some((subscription) => subscription !== null)) return true;
  if (inFlightOperations.some((operation) => operation !== null)) return true;

  const cleanupOperationGroups = await Promise.all(
    INVALID_TRIAL_CLEANUP_STATUSES.map((status) =>
      ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_recoveryPurpose_and_status", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("recoveryPurpose", "invalidTrialSubscriptionCancellation")
            .eq("status", status),
        )
        .take(CREATE_TRIAL_OPERATION_PROOF_LIMIT + 1),
    ),
  );
  if (cleanupOperationGroups.some((operations) => operations.length > CREATE_TRIAL_OPERATION_PROOF_LIMIT)) {
    return true;
  }
  for (const cleanup of cleanupOperationGroups.flat()) {
    if (cleanup.status !== "succeeded" || !cleanup.sourceOperationId) return true;
    if (!(await hasUniqueTerminalSubscriptionEvidence(ctx, cleanup, organizationId))) return true;
    const source = await ctx.db.get(cleanup.sourceOperationId);
    if (
      source &&
      (source.kind !== "createTrialSubscription" ||
        source.organizationId !== organizationId ||
        source.livemode !== cleanup.livemode ||
        source.providerGeneration !== cleanup.providerGeneration ||
        source.stripeObjectId !== cleanup.stripeObjectId)
    ) {
      return true;
    }
  }

  const providerObjectOperationGroups = await Promise.all(
    CREATE_TRIAL_PROVIDER_OBJECT_STATUSES.map((status) =>
      ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_status", (q) =>
          q.eq("organizationId", organizationId).eq("kind", "createTrialSubscription").eq("status", status),
        )
        .order("desc")
        .take(CREATE_TRIAL_OPERATION_PROOF_LIMIT + 1),
    ),
  );
  if (providerObjectOperationGroups.some((operations) => operations.length > CREATE_TRIAL_OPERATION_PROOF_LIMIT)) {
    return true;
  }

  const providerObjectOperations = providerObjectOperationGroups.flat();
  const terminalProofs = await Promise.all(
    providerObjectOperations.map(
      async (operation) => await hasUniqueTerminalSubscriptionEvidence(ctx, operation, organizationId),
    ),
  );
  return terminalProofs.some((provedTerminal) => !provedTerminal);
}

export function isOrganizationBillingStateDeletable(state: Doc<"organizationBillingStates">["state"]) {
  return (
    (state.kind === "trial" && state.selectedPaidPlan === undefined) ||
    (state.kind === "active" && state.plan === "free") ||
    state.kind === "complimentary"
  );
}
