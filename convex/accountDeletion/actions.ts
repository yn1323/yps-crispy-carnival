"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { getAccountDeletionConfiguration, hasRequiredAccountDeletionConfiguration } from "./config";
import {
  type AccountDeletionProvider,
  type AccountDeletionProviderError,
  classifyProviderError,
  createClerkAccountDeletionProvider,
} from "./provider";

type AccountDeletionWorkerCtx = Pick<ActionCtx, "runMutation">;

export const processJob = internalAction({
  args: { jobId: v.id("accountDeletionJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const provider = createClerkAccountDeletionProvider(getAccountDeletionConfiguration());
    await runAccountDeletionJob(ctx, provider, jobId);
    return null;
  },
});

export const readiness = internalAction({
  args: {},
  returns: v.union(v.object({ ready: v.literal(true) }), v.object({ ready: v.literal(false), code: v.string() })),
  handler: async () => {
    const config = getAccountDeletionConfiguration();
    return await checkAccountDeletionReadiness(createClerkAccountDeletionProvider(config), config);
  },
});

export async function checkAccountDeletionReadiness(
  provider: AccountDeletionProvider,
  config: ReturnType<typeof getAccountDeletionConfiguration>,
) {
  if (!hasRequiredAccountDeletionConfiguration(config)) {
    return { ready: false as const, code: "provider_configuration_missing" };
  }
  try {
    await provider.assertReady(config.expectedIssuer);
    return { ready: true as const };
  } catch (error) {
    return { ready: false as const, code: classifyProviderError(error).code };
  }
}

export async function runAccountDeletionJob(
  ctx: AccountDeletionWorkerCtx,
  provider: AccountDeletionProvider,
  jobId: Id<"accountDeletionJobs">,
) {
  const claimed = await ctx.runMutation(internal.accountDeletion.mutations.claim, { jobId });
  if (!claimed) return;

  let expectedVersion = claimed.version;
  try {
    await provider.assertReady(claimed.expectedIssuer);
  } catch (error) {
    await recordProviderFailure(ctx, claimed, expectedVersion, classifyProviderError(error));
    return;
  }

  let lookup: Awaited<ReturnType<AccountDeletionProvider["getUser"]>>;
  try {
    lookup = await provider.getUser(claimed.clerkUserId);
  } catch (error) {
    await recordProviderFailure(ctx, claimed, expectedVersion, classifyProviderError(error));
    return;
  }

  if (lookup === "notFound") {
    if (claimed.providerUserVerifiedAt !== undefined && claimed.deleteAttemptedAt !== undefined) {
      await ctx.runMutation(internal.accountDeletion.mutations.markCompleted, {
        jobId: claimed.jobId,
        leaseId: claimed.leaseId,
        expectedVersion,
      });
    } else {
      await ctx.runMutation(internal.accountDeletion.mutations.markActionRequired, {
        jobId: claimed.jobId,
        leaseId: claimed.leaseId,
        expectedVersion,
        errorCode: "provider_user_not_found_before_verification",
      });
    }
    return;
  }

  if (claimed.phase === "verifyProviderUser") {
    const verified = await ctx.runMutation(internal.accountDeletion.mutations.markProviderUserVerified, {
      jobId: claimed.jobId,
      leaseId: claimed.leaseId,
      expectedVersion,
    });
    if (verified.status === "stale") return;
    expectedVersion = verified.version;
  }

  const prepared = await ctx.runMutation(internal.accountDeletion.mutations.prepareProviderDeletion, {
    jobId: claimed.jobId,
    leaseId: claimed.leaseId,
    expectedVersion,
  });
  if (prepared.status !== "ready") return;
  expectedVersion = prepared.version;

  let deletion: Awaited<ReturnType<AccountDeletionProvider["deleteUser"]>>;
  try {
    deletion = await provider.deleteUser(claimed.clerkUserId);
  } catch (error) {
    await recordProviderFailure(ctx, claimed, expectedVersion, classifyProviderError(error));
    return;
  }
  if (deletion === "deleted" || deletion === "notFound") {
    await ctx.runMutation(internal.accountDeletion.mutations.markCompleted, {
      jobId: claimed.jobId,
      leaseId: claimed.leaseId,
      expectedVersion,
    });
  }
}

async function recordProviderFailure(
  ctx: AccountDeletionWorkerCtx,
  claimed: {
    jobId: Id<"accountDeletionJobs">;
    leaseId: string;
  },
  expectedVersion: number,
  error: AccountDeletionProviderError,
) {
  const args = {
    jobId: claimed.jobId,
    leaseId: claimed.leaseId,
    expectedVersion,
    errorCode: error.code,
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
  };
  if (error.retryable) {
    await ctx.runMutation(internal.accountDeletion.mutations.markRetry, args);
  } else {
    await ctx.runMutation(internal.accountDeletion.mutations.markActionRequired, args);
  }
}
