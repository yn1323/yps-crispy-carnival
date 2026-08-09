"use node";

import { createClerkClient } from "@clerk/backend";
import type { AccountDeletionConfiguration } from "../accountDeletion/config";
import {
  type AccountDeletionProviderError,
  assertClerkProviderReady,
  classifyProviderError,
  withClerkProviderTimeout,
} from "../accountDeletion/provider";
import { normalizeEmail } from "./validation";

export type ClerkVerifiedEmailProviderErrorCode = AccountDeletionProviderError["code"] | "provider_user_mismatch";

export class ClerkVerifiedEmailProviderError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: ClerkVerifiedEmailProviderErrorCode,
  ) {
    super(code);
    this.name = "ClerkVerifiedEmailProviderError";
  }
}

export interface ClerkVerifiedEmailProvider {
  assertReady(expectedIssuer: string): Promise<void>;
  getVerifiedEmails(clerkUserId: string): Promise<ReadonlySet<string>>;
}

export function createClerkVerifiedEmailProvider(
  config: Pick<AccountDeletionConfiguration, "secretKey" | "publishableKey" | "expectedIssuer">,
): ClerkVerifiedEmailProvider {
  let client: ReturnType<typeof createClerkClient> | undefined;
  const getClient = () => {
    client ??= createClerkClient({ secretKey: config.secretKey, publishableKey: config.publishableKey });
    return client;
  };

  return {
    async assertReady(expectedIssuer) {
      try {
        await assertClerkProviderReady(config, expectedIssuer, async () => await getClient().domains.list());
      } catch (error) {
        throw classifyClerkVerifiedEmailProviderError(error);
      }
    },

    async getVerifiedEmails(clerkUserId) {
      try {
        const user = await withClerkProviderTimeout(getClient().users.getUser(clerkUserId));
        if (user.id !== clerkUserId) {
          throw new ClerkVerifiedEmailProviderError(false, "provider_user_mismatch");
        }
        return new Set(
          user.emailAddresses
            .filter((emailAddress) => emailAddress.verification?.status === "verified")
            .map((emailAddress) => normalizeEmail(emailAddress.emailAddress)),
        );
      } catch (error) {
        throw classifyClerkVerifiedEmailProviderError(error);
      }
    },
  };
}

export function classifyClerkVerifiedEmailProviderError(error: unknown): ClerkVerifiedEmailProviderError {
  if (error instanceof ClerkVerifiedEmailProviderError) return error;
  const providerError = classifyProviderError(error);
  return new ClerkVerifiedEmailProviderError(providerError.retryable, providerError.code);
}
