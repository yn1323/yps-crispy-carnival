import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { rateLimit } from "../_lib/rateLimits";
import { getActiveUserAssociationStatus } from "../deletionCleanup/service";
import { getAccountDeletionConfiguration, hasRequiredAccountDeletionConfiguration, normalizeIssuer } from "./config";
import {
  ACCOUNT_DELETION_JOB_LEASE_MS,
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  ACCOUNT_DELETION_PRUNE_BATCH_SIZE,
  ACCOUNT_DELETION_RECOVERY_BATCH_SIZE,
  ACCOUNT_DELETION_RETENTION_MS,
  ACCOUNT_DELETION_RETRY_BASE_MS,
  ACCOUNT_DELETION_RETRY_MAX_MS,
} from "./constants";
import { accountDeletionErrorCodeValidator, accountDeletionRequestSchema } from "./schemas";

const acceptResultValidator = v.union(
  v.object({ status: v.literal("accepted") }),
  v.object({ status: v.literal("conflict") }),
  v.object({ status: v.literal("rateLimited") }),
  v.object({ status: v.literal("unavailable") }),
);

const claimedJobValidator = v.union(
  v.object({
    jobId: v.id("accountDeletionJobs"),
    userId: v.id("users"),
    clerkUserId: v.string(),
    expectedIssuer: v.string(),
    phase: v.union(v.literal("verifyProviderUser"), v.literal("deleteProviderUser")),
    version: v.number(),
    leaseId: v.string(),
    attemptCount: v.number(),
    providerUserVerifiedAt: v.optional(v.number()),
    deleteAttemptedAt: v.optional(v.number()),
  }),
  v.null(),
);

const versionTransitionValidator = v.union(
  v.object({ status: v.literal("updated"), version: v.number() }),
  v.object({ status: v.literal("stale") }),
);

const failureArgs = {
  jobId: v.id("accountDeletionJobs"),
  leaseId: v.string(),
  expectedVersion: v.number(),
  errorCode: accountDeletionErrorCodeValidator,
  retryAfterMs: v.optional(v.number()),
};

export const accept = internalMutation({
  args: {
    issuer: v.string(),
    clerkUserId: v.string(),
    requestId: v.string(),
    rateLimitKey: v.string(),
  },
  returns: acceptResultValidator,
  handler: async (ctx, args) => {
    const issuer = normalizeIssuer(args.issuer);
    if (
      !issuer ||
      !accountDeletionRequestSchema.safeParse({ requestId: args.requestId }).success ||
      !isClerkUserId(args.clerkUserId) ||
      !/^[a-f0-9]{64}$/.test(args.rateLimitKey)
    ) {
      return { status: "conflict" as const };
    }

    const authTokenIdentifier = `${issuer}|${args.clerkUserId}`;
    const users = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", authTokenIdentifier))
      .take(2);
    if (users.length > 1) return { status: "conflict" as const };

    const existingUser = users[0];
    if (existingUser) {
      const jobs = await ctx.db
        .query("accountDeletionJobs")
        .withIndex("by_userId", (q) => q.eq("userId", existingUser._id))
        .take(2);
      if (jobs.length > 1) return { status: "conflict" as const };
      // 設定検証とrate limitより先に既存jobを返し、同じ要求の通信再送を常に収束させる。
      if (jobs[0]) return { status: "accepted" as const };
      if (existingUser.accountDeletionRequestedAt !== undefined) return { status: "conflict" as const };
    }

    const config = getAccountDeletionConfiguration();
    if (!hasRequiredAccountDeletionConfiguration(config) || config.expectedIssuer !== issuer) {
      return { status: "unavailable" as const };
    }

    const limit = await rateLimit(ctx, { name: "accountDeletionRequest", key: args.rateLimitKey });
    if (!limit.ok) return { status: "rateLimited" as const };

    if (existingUser) {
      const associationStatus = await getActiveUserAssociationStatus(ctx, existingUser._id);
      if (associationStatus !== "none") return { status: "conflict" as const };
    }

    const now = Date.now();
    const userId = existingUser
      ? existingUser._id
      : await ctx.db.insert("users", {
          authTokenIdentifier,
          name: "削除済みユーザー",
          email: `account-deletion-${args.requestId}@example.invalid`,
          emailNormalized: `account-deletion-${args.requestId}@example.invalid`,
          role: "manager",
          isDeleted: true,
          accountDeletionRequestedAt: now,
        });
    await ctx.db.patch(userId, {
      isDeleted: true,
      accountDeletionRequestedAt: now,
    });

    const jobId = await ctx.db.insert("accountDeletionJobs", {
      userId,
      requestId: args.requestId,
      clerkUserId: args.clerkUserId,
      expectedIssuer: issuer,
      status: "queued",
      phase: "verifyProviderUser",
      version: 1,
      attemptCount: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.accountDeletion.actions.processJob, { jobId });
    return { status: "accepted" as const };
  },
});

export const claim = internalMutation({
  args: { jobId: v.id("accountDeletionJobs") },
  returns: claimedJobValidator,
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status === "completed" || job.status === "actionRequired") return null;

    const now = Date.now();
    const leaseExpired = job.status === "processing" && (job.leaseExpiresAt ?? 0) <= now;
    if (job.status === "processing" && !leaseExpired) return null;
    if ((job.status === "queued" || job.status === "retrying") && job.nextRunAt > now) {
      await ctx.scheduler.runAfter(job.nextRunAt - now, internal.accountDeletion.actions.processJob, { jobId });
      return null;
    }
    if (!job.clerkUserId || !job.expectedIssuer || job.phase === "complete") {
      await setActionRequired(ctx, job, "invalid_provider_evidence", now);
      return null;
    }
    if (
      (job.phase === "verifyProviderUser" &&
        (job.providerUserVerifiedAt !== undefined || job.deleteAttemptedAt !== undefined)) ||
      (job.phase === "deleteProviderUser" && job.providerUserVerifiedAt === undefined) ||
      (job.deleteAttemptedAt !== undefined && job.providerUserVerifiedAt === undefined)
    ) {
      await setActionRequired(ctx, job, "invalid_provider_evidence", now);
      return null;
    }
    if (job.attemptCount >= ACCOUNT_DELETION_MAX_ATTEMPTS) {
      await setActionRequired(ctx, job, leaseExpired ? "lease_expired" : "retry_exhausted", now);
      return null;
    }

    const version = job.version + 1;
    const leaseId = `${job._id}:${version}:${now}`;
    const attemptCount = job.attemptCount + 1;
    await ctx.db.patch(job._id, {
      status: "processing",
      version,
      attemptCount,
      leaseId,
      leaseExpiresAt: now + ACCOUNT_DELETION_JOB_LEASE_MS,
      updatedAt: now,
    });
    return {
      jobId: job._id,
      userId: job.userId,
      clerkUserId: job.clerkUserId,
      expectedIssuer: job.expectedIssuer,
      phase: job.phase,
      version,
      leaseId,
      attemptCount,
      providerUserVerifiedAt: job.providerUserVerifiedAt,
      deleteAttemptedAt: job.deleteAttemptedAt,
    };
  },
});

export const markProviderUserVerified = internalMutation({
  args: { jobId: v.id("accountDeletionJobs"), leaseId: v.string(), expectedVersion: v.number() },
  returns: versionTransitionValidator,
  handler: async (ctx, args) => {
    const job = await currentLeasedJob(ctx, args);
    if (job?.phase !== "verifyProviderUser") return { status: "stale" as const };
    const now = Date.now();
    const version = job.version + 1;
    await ctx.db.patch(job._id, {
      phase: "deleteProviderUser",
      providerUserVerifiedAt: now,
      version,
      leaseExpiresAt: now + ACCOUNT_DELETION_JOB_LEASE_MS,
      updatedAt: now,
    });
    return { status: "updated" as const, version };
  },
});

export const prepareProviderDeletion = internalMutation({
  args: { jobId: v.id("accountDeletionJobs"), leaseId: v.string(), expectedVersion: v.number() },
  returns: v.union(
    v.object({ status: v.literal("ready"), version: v.number() }),
    v.object({ status: v.literal("blocked") }),
    v.object({ status: v.literal("stale") }),
  ),
  handler: async (ctx, args) => {
    const job = await currentLeasedJob(ctx, args);
    if (job?.phase !== "deleteProviderUser" || job.providerUserVerifiedAt === undefined) {
      return { status: "stale" as const };
    }

    const associationStatus = await getActiveUserAssociationStatus(ctx, job.userId);
    if (associationStatus !== "none") {
      await setActionRequired(
        ctx,
        job,
        associationStatus === "found"
          ? "association_found_before_provider_delete"
          : "association_scan_unknown_before_provider_delete",
        Date.now(),
      );
      return { status: "blocked" as const };
    }

    const now = Date.now();
    const version = job.version + 1;
    await ctx.db.patch(job._id, {
      deleteAttemptedAt: now,
      version,
      leaseExpiresAt: now + ACCOUNT_DELETION_JOB_LEASE_MS,
      updatedAt: now,
    });
    return { status: "ready" as const, version };
  },
});

export const markCompleted = internalMutation({
  args: { jobId: v.id("accountDeletionJobs"), leaseId: v.string(), expectedVersion: v.number() },
  returns: v.union(v.object({ status: v.literal("completed") }), v.object({ status: v.literal("stale") })),
  handler: async (ctx, args) => {
    const job = await currentLeasedJob(ctx, args);
    if (
      job?.phase !== "deleteProviderUser" ||
      job.providerUserVerifiedAt === undefined ||
      job.deleteAttemptedAt === undefined
    ) {
      return { status: "stale" as const };
    }
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "completed",
      phase: "complete",
      version: job.version + 1,
      nextRunAt: now,
      clerkUserId: undefined,
      expectedIssuer: undefined,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      providerDeletedAt: now,
      completedAt: now,
      updatedAt: now,
    });
    return { status: "completed" as const };
  },
});

export const markRetry = internalMutation({
  args: failureArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await currentLeasedJob(ctx, args);
    if (!job) return null;
    const now = Date.now();
    if (job.attemptCount >= ACCOUNT_DELETION_MAX_ATTEMPTS) {
      await setActionRequired(ctx, job, "retry_exhausted", now);
      return null;
    }
    const exponentialDelay = Math.min(
      ACCOUNT_DELETION_RETRY_BASE_MS * 2 ** Math.max(0, job.attemptCount - 1),
      ACCOUNT_DELETION_RETRY_MAX_MS,
    );
    const providerDelay = Number.isFinite(args.retryAfterMs)
      ? Math.max(0, Math.min(args.retryAfterMs ?? 0, ACCOUNT_DELETION_RETRY_MAX_MS))
      : 0;
    const nextRunAt = now + Math.max(exponentialDelay, providerDelay);
    await ctx.db.patch(job._id, {
      status: "retrying",
      version: job.version + 1,
      nextRunAt,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: args.errorCode,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(nextRunAt - now, internal.accountDeletion.actions.processJob, { jobId: job._id });
    return null;
  },
});

export const markActionRequired = internalMutation({
  args: failureArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await currentLeasedJob(ctx, args);
    if (!job) return null;
    await setActionRequired(ctx, job, args.errorCode, Date.now());
    return null;
  },
});

export const recover = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const perStatus = Math.floor(ACCOUNT_DELETION_RECOVERY_BATCH_SIZE / 3);
    const candidates = new Map<Id<"accountDeletionJobs">, Doc<"accountDeletionJobs">>();
    for (const status of ["queued", "retrying"] as const) {
      const jobs = await ctx.db
        .query("accountDeletionJobs")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", status).lte("nextRunAt", now))
        .take(perStatus);
      for (const job of jobs) candidates.set(job._id, job);
    }
    const expired = await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_status_and_leaseExpiresAt", (q) => q.eq("status", "processing").lte("leaseExpiresAt", now))
      .take(perStatus);
    for (const job of expired) candidates.set(job._id, job);

    const jobs = [...candidates.values()].slice(0, ACCOUNT_DELETION_RECOVERY_BATCH_SIZE);
    for (const job of jobs) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.actions.processJob, { jobId: job._id });
    }
    return { scheduled: jobs.length };
  },
});

export const retryActionRequired = internalMutation({
  args: { jobId: v.id("accountDeletionJobs"), expectedVersion: v.number() },
  returns: v.union(
    v.object({ status: v.literal("scheduled"), version: v.number() }),
    v.object({ status: v.literal("blocked") }),
    v.object({ status: v.literal("stale") }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== "actionRequired" || job.version !== args.expectedVersion) {
      return { status: "stale" as const };
    }
    if (!job.clerkUserId || !job.expectedIssuer || job.phase === "complete") return { status: "blocked" as const };
    if ((await getActiveUserAssociationStatus(ctx, job.userId)) !== "none") return { status: "blocked" as const };

    const now = Date.now();
    const version = job.version + 1;
    await ctx.db.patch(job._id, {
      status: "retrying",
      version,
      attemptCount: 0,
      nextRunAt: now,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.accountDeletion.actions.processJob, { jobId: job._id });
    return { status: "scheduled" as const, version };
  },
});

export const pruneCompleted = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - ACCOUNT_DELETION_RETENTION_MS;
    const jobs = await ctx.db
      .query("accountDeletionJobs")
      .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", "completed").lte("nextRunAt", cutoff))
      .take(ACCOUNT_DELETION_PRUNE_BATCH_SIZE + 1);
    let deleted = 0;
    const batch = jobs.slice(0, ACCOUNT_DELETION_PRUNE_BATCH_SIZE);
    for (const job of batch) {
      if (job.completedAt === undefined || !Number.isFinite(job.completedAt) || job.completedAt > cutoff) {
        // index keyと完了evidenceが食い違う行を隔離し、後続の正常な保持期限切れjobをstarveさせない。
        await setActionRequired(ctx, job, "invalid_provider_evidence", Date.now());
        continue;
      }
      await ctx.db.delete(job._id);
      deleted += 1;
    }
    if (jobs.length > ACCOUNT_DELETION_PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.mutations.pruneCompleted, {});
    }
    return { deleted };
  },
});

async function currentLeasedJob(
  ctx: MutationCtx,
  args: { jobId: Id<"accountDeletionJobs">; leaseId: string; expectedVersion: number },
) {
  const job = await ctx.db.get(args.jobId);
  if (
    job?.status !== "processing" ||
    job.leaseId !== args.leaseId ||
    job.version !== args.expectedVersion ||
    (job.leaseExpiresAt ?? 0) <= Date.now()
  ) {
    return null;
  }
  return job;
}

async function setActionRequired(
  ctx: MutationCtx,
  job: Doc<"accountDeletionJobs">,
  errorCode: Doc<"accountDeletionJobs">["lastErrorCode"],
  now: number,
) {
  await ctx.db.patch(job._id, {
    status: "actionRequired",
    version: job.version + 1,
    nextRunAt: now,
    leaseId: undefined,
    leaseExpiresAt: undefined,
    lastErrorCode: errorCode,
    updatedAt: now,
  });
}

function isClerkUserId(value: string): boolean {
  if (value.length === 0 || value.length > 256) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === "|" || code <= 0x20 || code === 0x7f) return false;
  }
  return true;
}
