import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
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
  return state.planIdVersion === undefined;
}

function isCanonicalTarget(state: { kind: string; planIdVersion?: 2; plan?: string }) {
  return state.planIdVersion === 2;
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
 * m042のpre/post flight。全organization pageを走査し、stateの一意性とplan ID versionを確認する。
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

type StripeScope = "customers" | "subscriptions" | "operations" | "webhooks";
type StripeRow =
  | Doc<"organizationStripeCustomers">
  | Doc<"organizationStripeSubscriptions">
  | Doc<"organizationStripeOperations">
  | Doc<"stripeWebhookEvents">;

async function hasDuplicateLogicalKey(ctx: QueryCtx, scope: StripeScope, row: StripeRow) {
  if (scope === "customers") {
    const customer = row as Doc<"organizationStripeCustomers">;
    const siblings = await ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", customer.organizationId))
      .take(2);
    return siblings.length > 1;
  }
  if (scope === "subscriptions") {
    const subscription = row as Doc<"organizationStripeSubscriptions">;
    const siblings = await ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) =>
        q.eq("organizationId", subscription.organizationId).eq("providerGeneration", subscription.providerGeneration),
      )
      .take(2);
    return siblings.length > 1;
  }
  if (scope === "operations") {
    const operation = row as Doc<"organizationStripeOperations">;
    const siblings = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q
          .eq("organizationId", operation.organizationId)
          .eq("kind", operation.kind)
          .eq("requestKey", operation.requestKey),
      )
      .take(2);
    return siblings.length > 1;
  }
  const webhook = row as Doc<"stripeWebhookEvents">;
  const siblings = await ctx.db
    .query("stripeWebhookEvents")
    .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", webhook.stripeEventId))
    .take(2);
  return siblings.length > 1;
}

/** Stripe各tableをglobalにpage走査し、orphanやscope固有の一意キー重複を止める。plan IDはm045 / m046で別途確認する。 */
export const verifyStripeRows = internalQuery({
  args: { scope: stripeScopeValidator, paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    totals: v.object({
      stripeRows: v.number(),
      danglingOrganization: v.number(),
      rowsWithDuplicateLogicalKey: v.number(),
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
    let rowsWithDuplicateLogicalKey = 0;
    for (const row of result.page) {
      const organizationId = row.organizationId;
      if (!organizationId || !(await ctx.db.get(organizationId))) {
        danglingOrganization += 1;
        continue;
      }
      if (await hasDuplicateLogicalKey(ctx, scope, row)) rowsWithDuplicateLogicalKey += 1;
    }
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: {
        stripeRows: result.page.length,
        danglingOrganization,
        rowsWithDuplicateLogicalKey,
        blocking: danglingOrganization + rowsWithDuplicateLogicalKey,
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
