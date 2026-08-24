import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";

const MAX_PAGE_SIZE = 100;

const pageMetadataValidator = {
  scannedCount: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
};

function requireBoundedPagination(paginationOpts: PaginationOptions) {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > MAX_PAGE_SIZE
  ) {
    throw new ConvexError(`numItems must be between 1 and ${MAX_PAGE_SIZE}`);
  }
}

function isLegacyTarget(state: { kind: string; planIdVersion?: 2; plan?: string }) {
  return state.kind === "complimentary" && state.planIdVersion === undefined && state.plan === "business";
}

function isCanonicalTarget(state: { kind: string; planIdVersion?: 2; plan?: string }) {
  return state.kind === "complimentary" && state.planIdVersion === 2 && state.plan === "pro";
}

async function stripeEvidence(ctx: QueryCtx, organizationId: Id<"organizations">) {
  const [customer, subscription, operation, webhook] = await Promise.all([
    ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .first(),
    ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
      .first(),
    ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
      .first(),
    ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .first(),
  ]);
  return {
    customer: customer ? 1 : 0,
    subscription: subscription ? 1 : 0,
    operation: operation ? 1 : 0,
    webhook: webhook ? 1 : 0,
  };
}

/**
 * m042のpre/post flight。全organization pageを走査し、支払い不要Pro以外やStripe証跡を件数だけで止める。
 * preではlegacy targetとresume済みv2を許可し、postではlegacy targetもblockingへ含める。
 */
export const verifyOrganizations = internalQuery({
  args: {
    phase: v.union(v.literal("pre"), v.literal("post")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    ...pageMetadataValidator,
    totals: v.object({
      legacyTarget: v.number(),
      canonicalTarget: v.number(),
      missingBillingState: v.number(),
      multipleBillingStates: v.number(),
      unexpectedBillingState: v.number(),
      stripeCustomerEvidence: v.number(),
      stripeSubscriptionEvidence: v.number(),
      stripeOperationEvidence: v.number(),
      stripeWebhookEvidence: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { phase, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizations").paginate(paginationOpts);
    const totals = {
      legacyTarget: 0,
      canonicalTarget: 0,
      missingBillingState: 0,
      multipleBillingStates: 0,
      unexpectedBillingState: 0,
      stripeCustomerEvidence: 0,
      stripeSubscriptionEvidence: 0,
      stripeOperationEvidence: 0,
      stripeWebhookEvidence: 0,
      blocking: 0,
    };

    for (const organization of result.page) {
      const states = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
        .take(2);
      if (states.length === 0) totals.missingBillingState += 1;
      else if (states.length > 1) totals.multipleBillingStates += 1;
      else if (isLegacyTarget(states[0].state)) totals.legacyTarget += 1;
      else if (isCanonicalTarget(states[0].state)) totals.canonicalTarget += 1;
      else totals.unexpectedBillingState += 1;

      const evidence = await stripeEvidence(ctx, organization._id);
      totals.stripeCustomerEvidence += evidence.customer;
      totals.stripeSubscriptionEvidence += evidence.subscription;
      totals.stripeOperationEvidence += evidence.operation;
      totals.stripeWebhookEvidence += evidence.webhook;
    }
    totals.blocking =
      totals.missingBillingState +
      totals.multipleBillingStates +
      totals.unexpectedBillingState +
      totals.stripeCustomerEvidence +
      totals.stripeSubscriptionEvidence +
      totals.stripeOperationEvidence +
      totals.stripeWebhookEvidence +
      (phase === "post" ? totals.legacyTarget : 0);

    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals,
    };
  },
});

/** organization側の走査では見えないdangling billing rowを全pageで検出する。 */
export const verifyBillingRows = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    totals: v.object({
      danglingOrganization: v.number(),
      duplicateOrganizationState: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationBillingStates").paginate(paginationOpts);
    let danglingOrganization = 0;
    let duplicateOrganizationState = 0;
    for (const state of result.page) {
      if (!(await ctx.db.get(state.organizationId))) danglingOrganization += 1;
      const siblings = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", state.organizationId))
        .take(2);
      if (siblings.length > 1) duplicateOrganizationState += 1;
    }
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: { danglingOrganization, duplicateOrganizationState },
    };
  },
});

const stripeScopeValidator = v.union(
  v.literal("customers"),
  v.literal("subscriptions"),
  v.literal("operations"),
  v.literal("webhooks"),
);

/** Stripe各tableをglobalにpage走査し、orphanや同一組織の複数行も含めて全証跡を止める。 */
export const verifyStripeRows = internalQuery({
  args: { scope: stripeScopeValidator, paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    totals: v.object({
      stripeRows: v.number(),
      danglingOrganization: v.number(),
      rowsInDuplicateOrganization: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { scope, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result =
      scope === "customers"
        ? await ctx.db.query("organizationStripeCustomers").paginate(paginationOpts)
        : scope === "subscriptions"
          ? await ctx.db.query("organizationStripeSubscriptions").paginate(paginationOpts)
          : scope === "operations"
            ? await ctx.db.query("organizationStripeOperations").paginate(paginationOpts)
            : await ctx.db.query("stripeWebhookEvents").paginate(paginationOpts);
    let danglingOrganization = 0;
    let rowsInDuplicateOrganization = 0;
    for (const row of result.page) {
      const organizationId = row.organizationId;
      if (!organizationId || !(await ctx.db.get(organizationId))) {
        danglingOrganization += 1;
        continue;
      }
      const siblings =
        scope === "customers"
          ? await ctx.db
              .query("organizationStripeCustomers")
              .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
              .take(2)
          : scope === "subscriptions"
            ? await ctx.db
                .query("organizationStripeSubscriptions")
                .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
                .take(2)
            : scope === "operations"
              ? await ctx.db
                  .query("organizationStripeOperations")
                  .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
                  .take(2)
              : await ctx.db
                  .query("stripeWebhookEvents")
                  .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
                  .take(2);
      if (siblings.length > 1) rowsInDuplicateOrganization += 1;
    }
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: {
        stripeRows: result.page.length,
        danglingOrganization,
        rowsInDuplicateOrganization,
        // Production前提はStripe証跡0件なので、row自体をblockingとする。
        blocking: result.page.length,
      },
    };
  },
});

/** Widen前のargsを保持し得る待機中・実行中billing jobをsystem tableで全page確認する。 */
export const verifyScheduledBillingJobs = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    totals: v.object({
      liveBillingJobs: v.number(),
      pending: v.number(),
      inProgress: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.system.query("_scheduled_functions").paginate(paginationOpts);
    let pending = 0;
    let inProgress = 0;
    for (const job of result.page) {
      if (!job.name.startsWith("organizationBilling/") && !job.name.startsWith("organizationStripe/")) continue;
      if (job.state.kind === "pending") pending += 1;
      else if (job.state.kind === "inProgress") inProgress += 1;
    }
    const liveBillingJobs = pending + inProgress;
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: { liveBillingJobs, pending, inProgress, blocking: liveBillingJobs },
    };
  },
});

/** 旧plan名を既にrenderした可能性がある未完了billing通知を全pageで止める。 */
export const verifyBillingNotificationOutbox = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    totals: v.object({
      pending: v.number(),
      processing: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("notificationOutbox").paginate(paginationOpts);
    let pending = 0;
    let processing = 0;
    for (const row of result.page) {
      if (row.purpose !== "billing") continue;
      if (row.status === "pending") pending += 1;
      else if (row.status === "processing") processing += 1;
    }
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: { pending, processing, blocking: pending + processing },
    };
  },
});
