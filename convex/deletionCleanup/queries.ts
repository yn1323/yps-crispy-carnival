import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { getDeletionCleanupJobForTarget } from "./service";
import {
  deletionCleanupScopeValidator,
  deletionCleanupStatusValidator,
  deletionCleanupTargetValidator,
} from "./validators";

const STATUS_PROBE_LIMIT = 50;
const PROBED_STATUSES = ["queued", "processing", "retrying", "actionRequired", "completed"] as const;

const jobStatusItemValidator = v.object({
  jobId: v.id("deletionCleanupJobs"),
  scope: deletionCleanupScopeValidator,
  phase: v.string(),
  attemptCount: v.number(),
  nextRunAt: v.number(),
  leaseExpiresAt: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  updatedAt: v.number(),
});

const statusSummaryValidator = v.object({
  status: deletionCleanupStatusValidator,
  observedCount: v.number(),
  hasMore: v.boolean(),
  oldestAt: v.optional(v.number()),
  jobs: v.array(jobStatusItemValidator),
});

/** coordinatorがlinked jobの対象と状態を、target IDやrequest payloadを追加露出せず確認する。 */
export const getLinkedJobState = internalQuery({
  args: {
    jobId: v.id("deletionCleanupJobs"),
    target: deletionCleanupTargetValidator,
  },
  returns: v.union(
    v.null(),
    v.object({
      jobId: v.id("deletionCleanupJobs"),
      status: deletionCleanupStatusValidator,
      version: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await getDeletionCleanupJobForTarget(ctx, args);
  },
});

/** PIIを返さず、未完了jobと完了到達をstatusごとにboundedで確認する運用probe。 */
export const getStatus = internalQuery({
  args: {},
  returns: v.object({
    checkedAt: v.number(),
    hasUnfinished: v.boolean(),
    statuses: v.array(statusSummaryValidator),
  }),
  handler: async (ctx) => {
    const checkedAt = Date.now();
    const statuses = [];

    for (const status of PROBED_STATUSES) {
      const rows =
        status === "processing"
          ? await ctx.db
              .query("deletionCleanupJobs")
              .withIndex("by_status_and_leaseExpiresAt", (q) => q.eq("status", status))
              .take(STATUS_PROBE_LIMIT + 1)
          : await ctx.db
              .query("deletionCleanupJobs")
              .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", status))
              .take(STATUS_PROBE_LIMIT + 1);
      const visibleRows = rows.slice(0, STATUS_PROBE_LIMIT);
      statuses.push({
        status,
        observedCount: visibleRows.length,
        hasMore: rows.length > STATUS_PROBE_LIMIT,
        ...(visibleRows[0] ? { oldestAt: operationalTimestamp(visibleRows[0], status) } : {}),
        jobs: visibleRows.map((job) => ({
          jobId: job._id,
          scope: job.scope,
          phase: safeOperationalCode(job.phase, "invalidPhase"),
          attemptCount: job.attemptCount,
          nextRunAt: job.nextRunAt,
          ...(job.leaseExpiresAt !== undefined ? { leaseExpiresAt: job.leaseExpiresAt } : {}),
          ...(job.lastErrorCode !== undefined
            ? { lastErrorCode: safeOperationalCode(job.lastErrorCode, "unsafe_error_code_redacted") }
            : {}),
          updatedAt: job.updatedAt,
        })),
      });
    }

    return {
      checkedAt,
      hasUnfinished: statuses.some((summary) => summary.status !== "completed" && summary.observedCount > 0),
      statuses,
    };
  },
});

function operationalTimestamp(job: Doc<"deletionCleanupJobs">, status: (typeof PROBED_STATUSES)[number]) {
  if (status === "processing") return job.leaseExpiresAt ?? job.updatedAt;
  if (status === "queued" || status === "retrying") return job.nextRunAt;
  return job.updatedAt;
}

function safeOperationalCode(value: string, fallback: string) {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : fallback;
}
