"use node";

import { createClerkClient } from "@clerk/backend";
import type { AccountDeletionConfiguration } from "../accountDeletion/config";
import {
  type AccountDeletionProviderError,
  assertClerkProviderReady,
  classifyProviderError,
  withClerkProviderTimeout,
} from "../accountDeletion/provider";

export type AccountEmailProviderErrorCode =
  | AccountDeletionProviderError["code"]
  | "provider_user_mismatch"
  | "provider_primary_missing"
  | "provider_primary_unverified";

export class AccountEmailProviderError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: AccountEmailProviderErrorCode,
  ) {
    super(code);
    this.name = "AccountEmailProviderError";
  }
}

export interface AccountEmailProvider {
  assertReady(expectedIssuer: string): Promise<void>;
  getVerifiedPrimaryEmail(clerkUserId: string): Promise<string>;
}

export function createClerkAccountEmailProvider(
  config: Pick<AccountDeletionConfiguration, "secretKey" | "publishableKey" | "expectedIssuer">,
): AccountEmailProvider {
  let client: ReturnType<typeof createClerkClient> | undefined;
  const getClient = () => {
    client ??= createClerkClient({
      secretKey: config.secretKey,
      publishableKey: config.publishableKey,
    });
    return client;
  };

  return {
    async assertReady(expectedIssuer) {
      try {
        await assertClerkProviderReady(config, expectedIssuer, async () => await getClient().domains.list());
      } catch (error) {
        throw classifyAccountEmailProviderError(error);
      }
    },

    async getVerifiedPrimaryEmail(clerkUserId) {
      try {
        const user = await withClerkProviderTimeout(getClient().users.getUser(clerkUserId));
        if (user.id !== clerkUserId) {
          throw new AccountEmailProviderError(false, "provider_user_mismatch");
        }
        if (!user.primaryEmailAddressId) {
          throw new AccountEmailProviderError(false, "provider_primary_missing");
        }
        const primary = user.emailAddresses.find((emailAddress) => emailAddress.id === user.primaryEmailAddressId);
        if (!primary) {
          throw new AccountEmailProviderError(false, "provider_primary_missing");
        }
        if (primary.verification?.status !== "verified") {
          throw new AccountEmailProviderError(false, "provider_primary_unverified");
        }
        return primary.emailAddress;
      } catch (error) {
        throw classifyAccountEmailProviderError(error);
      }
    },
  };
}

export function classifyAccountEmailProviderError(error: unknown): AccountEmailProviderError {
  if (error instanceof AccountEmailProviderError) return error;
  const providerError = classifyProviderError(error);
  return new AccountEmailProviderError(providerError.retryable, providerError.code);
}
