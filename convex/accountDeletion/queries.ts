import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { authenticatedQuery } from "../_lib/functions";
import { isValidIsoDateString } from "../_lib/validation";
import { getActiveUserAssociationStatus } from "../deletionCleanup/service";
import { getAccountDeletionConfiguration, hasRequiredAccountDeletionConfiguration, normalizeIssuer } from "./config";
import { ACCOUNT_DELETION_LEGACY_PROBE_LIMIT, ACCOUNT_DELETION_PROBE_LIMIT_PER_STATUS } from "./constants";
import { getAccountDeletionPlan, toPublicAccountDeletionPreview } from "./eligibility";
import { accountDeletionJobStatusValidator } from "./schemas";

const blockedReasonValidator = v.union(
  v.literal("multipleOrganizations"),
  v.literal("billingContactTransferRequired"),
  v.literal("recoveryManagerTransferRequired"),
  v.literal("organizationDeletionUnavailable"),
  v.literal("tooManyAssociatedRecords"),
  v.literal("tooManyFutureAssignments"),
  v.literal("inconsistentAssociation"),
  v.literal("providerConfigurationUnavailable"),
  v.literal("deletionAlreadyRequested"),
  v.literal("unavailable"),
);

const deletionPreviewValidator = v.union(
  v.object({ status: v.literal("blocked"), reason: blockedReasonValidator }),
  v.object({
    status: v.literal("ready"),
    action: v.literal("accountOnly"),
    previewFingerprint: v.string(),
  }),
  v.object({
    status: v.literal("ready"),
    action: v.literal("leaveOrganization"),
    previewFingerprint: v.string(),
    organization: v.object({ name: v.string(), shopCount: v.number() }),
    futureAssignmentCount: v.number(),
  }),
  v.object({
    status: v.literal("ready"),
    action: v.literal("deleteOrganization"),
    previewFingerprint: v.string(),
    organization: v.object({ name: v.string(), shopCount: v.number() }),
  }),
);

/** 本人の全associationをserverで分類し、破壊対象IDを含まない確認用snapshotだけを返す。 */
export const getDeletionPreview = authenticatedQuery({
  args: { asOfDate: v.string() },
  returns: deletionPreviewValidator,
  handler: async (ctx, args) => {
    const { identity, user } = ctx;
    if (!identity || !isValidIsoDateString(args.asOfDate)) {
      return { status: "blocked" as const, reason: "unavailable" as const };
    }

    const configuration = getAccountDeletionConfiguration();
    if (
      !hasRequiredAccountDeletionConfiguration(configuration) ||
      configuration.expectedIssuer !== normalizeIssuer(identity.issuer)
    ) {
      return { status: "blocked" as const, reason: "providerConfigurationUnavailable" as const };
    }

    if (user) {
      const jobs = await ctx.db
        .query("accountDeletionJobs")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(2);
      if (jobs.length > 0) {
        return {
          status: "blocked" as const,
          reason: jobs.length === 1 ? ("deletionAlreadyRequested" as const) : ("inconsistentAssociation" as const),
        };
      }
    }
    const plan = await getAccountDeletionPlan(ctx, {
      user,
      authTokenIdentifier: identity.tokenIdentifier,
      asOfDate: args.asOfDate,
    });
    return toPublicAccountDeletionPreview(plan);
  },
});

export const probeJobs = internalQuery({
  args: {},
  returns: v.object({
    statuses: v.array(
      v.object({
        status: accountDeletionJobStatusValidator,
        observedCount: v.number(),
        hasMore: v.boolean(),
        oldestObservedUpdatedAt: v.optional(v.number()),
      }),
    ),
    errors: v.array(v.object({ code: v.string(), count: v.number() })),
  }),
  handler: async (ctx) => {
    const statuses = [];
    const errorCounts = new Map<string, number>();
    for (const status of ["queued", "processing", "retrying", "actionRequired", "completed"] as const) {
      const jobs = await ctx.db
        .query("accountDeletionJobs")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", status))
        .take(ACCOUNT_DELETION_PROBE_LIMIT_PER_STATUS + 1);
      const sampled = jobs.slice(0, ACCOUNT_DELETION_PROBE_LIMIT_PER_STATUS);
      for (const job of sampled) {
        if (job.lastErrorCode) errorCounts.set(job.lastErrorCode, (errorCounts.get(job.lastErrorCode) ?? 0) + 1);
      }
      const oldestObservedUpdatedAt = sampled.reduce<number | undefined>(
        (oldest, job) => (oldest === undefined || job.updatedAt < oldest ? job.updatedAt : oldest),
        undefined,
      );
      statuses.push({
        status,
        observedCount: sampled.length,
        hasMore: jobs.length > ACCOUNT_DELETION_PROBE_LIMIT_PER_STATUS,
        ...(oldestObservedUpdatedAt !== undefined ? { oldestObservedUpdatedAt } : {}),
      });
    }
    return {
      statuses,
      errors: [...errorCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, count]) => ({ code, count })),
    };
  },
});

export const probeLegacyDeletedUsers = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    scanned: v.number(),
    withActiveAssociation: v.number(),
    unknownAssociation: v.number(),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_isDeleted_and_accountDeletionRequestedAt", (q) =>
        q.eq("isDeleted", true).eq("accountDeletionRequestedAt", undefined),
      )
      .paginate({ cursor: args.cursor, numItems: ACCOUNT_DELETION_LEGACY_PROBE_LIMIT });
    let withActiveAssociation = 0;
    let unknownAssociation = 0;
    for (const user of users.page) {
      const status = await getActiveUserAssociationStatus(ctx, user._id);
      if (status === "found") withActiveAssociation += 1;
      if (status === "unknown") unknownAssociation += 1;
    }
    return {
      scanned: users.page.length,
      withActiveAssociation,
      unknownAssociation,
      continueCursor: users.continueCursor,
      isDone: users.isDone,
    };
  },
});
