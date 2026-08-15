"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, action } from "../_generated/server";
import {
  type ClerkVerifiedEmailProvider,
  classifyClerkVerifiedEmailProviderError,
  createClerkVerifiedEmailProvider,
} from "../_lib/clerkVerifiedEmailProvider";
import { isReleaseFeatureEnabled } from "../_lib/releaseFeatures";
import { getAccountDeletionConfiguration, normalizeIssuer } from "../accountDeletion/config";

const acceptanceActionResultValidator = v.union(
  v.object({ status: v.literal("linked"), organizationId: v.id("organizations"), shopId: v.optional(v.id("shops")) }),
  v.object({ status: v.literal("verificationRequired") }),
  v.object({ status: v.literal("invalid") }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("revoked") }),
  v.object({ status: v.literal("used") }),
  v.object({ status: v.literal("conflict") }),
  v.object({ status: v.literal("unavailable"), retryable: v.boolean() }),
);

type AcceptanceActionResult =
  | { status: "linked"; organizationId: Id<"organizations">; shopId?: Id<"shops"> }
  | { status: "verificationRequired" | "invalid" | "expired" | "revoked" | "used" | "conflict" }
  | { status: "unavailable"; retryable: boolean };

type AcceptanceActionCtx = Pick<ActionCtx, "auth" | "runMutation">;
type ClerkAcceptanceConfiguration = ReturnType<typeof getAccountDeletionConfiguration>;

export const accept = action({
  args: { token: v.string() },
  returns: acceptanceActionResultValidator,
  handler: async (ctx, { token }) => {
    if (!isReleaseFeatureEnabled("managerInvitation")) {
      return { status: "unavailable" as const, retryable: false };
    }
    const config = getAccountDeletionConfiguration();
    return await runInvitationAcceptance(ctx, createClerkVerifiedEmailProvider(config), config, token);
  },
});

export async function runInvitationAcceptance(
  ctx: AcceptanceActionCtx,
  provider: ClerkVerifiedEmailProvider,
  config: ClerkAcceptanceConfiguration,
  token: string,
): Promise<AcceptanceActionResult> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { status: "unavailable", retryable: false };

  const identityIssuer = normalizeIssuer(identity.issuer);
  if (!identityIssuer || identityIssuer !== config.expectedIssuer) {
    return { status: "unavailable", retryable: false };
  }

  const prepared = await ctx.runMutation(internal.organizationInvitation.mutations.prepareAcceptance, { token });
  if (prepared.status === "unavailable") return { status: "unavailable", retryable: false };
  if (prepared.status !== "ready") return prepared;

  let verifiedEmailNormalized: string | undefined;
  if (prepared.requiresVerifiedEmail) {
    try {
      await provider.assertReady(identityIssuer);
      const verifiedEmails = await provider.getVerifiedEmails(identity.subject);
      if (!verifiedEmails.has(prepared.emailNormalized)) return { status: "verificationRequired" };
      verifiedEmailNormalized = prepared.emailNormalized;
    } catch (error) {
      const providerError = classifyClerkVerifiedEmailProviderError(error);
      return { status: "unavailable", retryable: providerError.retryable };
    }
  }

  const finalized = await ctx.runMutation(internal.organizationInvitation.mutations.finalizeAcceptance, {
    token,
    proof: {
      actorTokenIdentifier: identity.tokenIdentifier,
      actorSubject: identity.subject,
      invitationId: prepared.invitationId,
      expectedVersion: prepared.expectedVersion,
      tokenDigest: prepared.tokenDigest,
      ...(verifiedEmailNormalized ? { verifiedEmailNormalized } : {}),
    },
  });
  if (finalized.status === "unavailable") return { status: "unavailable", retryable: false };
  // Proof付き経路ではemailMismatchは発生しない。旧DTOが型に残る間だけconflictへ閉じる。
  if (finalized.status === "emailMismatch" || finalized.status === "conflict") return { status: "conflict" };
  if (finalized.status === "linked") {
    return {
      status: "linked",
      organizationId: finalized.organizationId,
      ...(finalized.shopId ? { shopId: finalized.shopId } : {}),
    };
  }
  return { status: finalized.status };
}
