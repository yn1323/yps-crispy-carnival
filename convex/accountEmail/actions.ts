"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { type ActionCtx, action } from "../_generated/server";
import { getAccountDeletionConfiguration, normalizeIssuer } from "../accountDeletion/config";
import {
  type AccountEmailProvider,
  AccountEmailProviderError,
  classifyAccountEmailProviderError,
  createClerkAccountEmailProvider,
} from "./provider";

const syncResultValidator = v.union(
  v.object({ status: v.literal("synced"), changed: v.boolean() }),
  v.object({ status: v.literal("conflict") }),
  v.object({ status: v.literal("rateLimited") }),
  v.object({ status: v.literal("unavailable"), retryable: v.boolean() }),
);

type AccountEmailActionCtx = Pick<ActionCtx, "auth" | "runMutation">;
type AccountEmailConfiguration = {
  secretKey: string;
  publishableKey: string;
  expectedIssuer: string;
};

export type SyncMyPrimaryEmailResult =
  | { status: "synced"; changed: boolean }
  | { status: "conflict" }
  | { status: "rateLimited" }
  | { status: "unavailable"; retryable: boolean };

type PrepareSyncResult = { status: "ready"; requestKey: string } | { status: "conflict" } | { status: "rateLimited" };

export const syncMyPrimaryEmail = action({
  args: { requestId: v.string() },
  returns: syncResultValidator,
  handler: async (ctx, args): Promise<SyncMyPrimaryEmailResult> => {
    const config = getAccountDeletionConfiguration();
    const provider = createClerkAccountEmailProvider(config);
    return await runSyncMyPrimaryEmail(ctx, provider, config, args.requestId);
  },
});

export async function runSyncMyPrimaryEmail(
  ctx: AccountEmailActionCtx,
  provider: AccountEmailProvider,
  config: AccountEmailConfiguration,
  requestId: string,
): Promise<SyncMyPrimaryEmailResult> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { status: "conflict" as const };
  const issuer = normalizeIssuer(identity.issuer);
  if (
    !issuer ||
    !config.secretKey ||
    !config.publishableKey ||
    !config.expectedIssuer ||
    issuer !== config.expectedIssuer ||
    !isClerkUserId(identity.subject)
  ) {
    return { status: "unavailable" as const, retryable: false };
  }

  const prepared: PrepareSyncResult = await ctx.runMutation(internal.accountEmail.mutations.prepareSync, {
    authTokenIdentifier: identity.tokenIdentifier,
    requestId,
  });
  if (prepared.status !== "ready") return prepared;

  try {
    await provider.assertReady(issuer);
    const email = await provider.getVerifiedPrimaryEmail(identity.subject);
    return await ctx.runMutation(internal.accountEmail.mutations.syncPrimary, {
      authTokenIdentifier: identity.tokenIdentifier,
      email,
      requestKey: prepared.requestKey,
    });
  } catch (error) {
    const providerError = error instanceof AccountEmailProviderError ? error : classifyAccountEmailProviderError(error);
    if (providerError.code === "provider_primary_missing" || providerError.code === "provider_primary_unverified") {
      return { status: "conflict" as const };
    }
    return { status: "unavailable" as const, retryable: providerError.retryable };
  }
}

function isClerkUserId(value: string): boolean {
  if (value.length === 0 || value.length > 256) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === "|" || code <= 0x20 || code === 0x7f) return false;
  }
  return true;
}
