import { createClerkClient } from "@clerk/backend";
import {
  isDevelopmentFromPublishableKey,
  isDevelopmentFromSecretKey,
  isProductionFromPublishableKey,
  isProductionFromSecretKey,
  parsePublishableKey,
} from "@clerk/shared/keys";
import type { AccountDeletionConfiguration } from "./config";
import { normalizeIssuer } from "./config";
import { ACCOUNT_DELETION_PROVIDER_TIMEOUT_MS, ACCOUNT_DELETION_RETRY_MAX_MS } from "./constants";
import type { AccountDeletionErrorCode } from "./schemas";

export type ProviderUserLookup = "found" | "notFound";
export type ProviderUserDeletion = "deleted" | "notFound";

export interface AccountDeletionProvider {
  assertReady(expectedIssuer: string): Promise<void>;
  getUser(clerkUserId: string): Promise<ProviderUserLookup>;
  deleteUser(clerkUserId: string): Promise<ProviderUserDeletion>;
}

export class AccountDeletionProviderError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: AccountDeletionErrorCode,
    readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = "AccountDeletionProviderError";
  }
}

export function createClerkAccountDeletionProvider(config: AccountDeletionConfiguration): AccountDeletionProvider {
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
      assertLocalConfiguration(config, expectedIssuer);
      const providerClient = getClient();
      let domains: Awaited<ReturnType<typeof providerClient.domains.list>>;
      try {
        domains = await withTimeout(providerClient.domains.list());
      } catch (error) {
        throw classifyProviderError(error);
      }
      if (!domains.data.some((domain) => normalizeIssuer(domain.frontendApiUrl) === config.expectedIssuer)) {
        throw new AccountDeletionProviderError(false, "provider_instance_mismatch");
      }
    },

    async getUser(clerkUserId) {
      try {
        const user = await withTimeout(getClient().users.getUser(clerkUserId));
        if (user.id !== clerkUserId) {
          throw new AccountDeletionProviderError(false, "provider_configuration_mismatch");
        }
        return "found";
      } catch (error) {
        if (providerStatus(error) === 404) return "notFound";
        throw classifyProviderError(error);
      }
    },

    async deleteUser(clerkUserId) {
      try {
        await withTimeout(getClient().users.deleteUser(clerkUserId));
        return "deleted";
      } catch (error) {
        if (providerStatus(error) === 404) return "notFound";
        throw classifyProviderError(error);
      }
    },
  };
}

export function classifyProviderError(error: unknown): AccountDeletionProviderError {
  if (error instanceof AccountDeletionProviderError) return error;
  const status = providerStatus(error);
  if (status === 408) {
    return new AccountDeletionProviderError(true, "provider_timeout");
  }
  if (status === 429) {
    return new AccountDeletionProviderError(true, "provider_rate_limited", providerRetryAfterMs(error));
  }
  if (status !== undefined && status >= 500) {
    return new AccountDeletionProviderError(true, "provider_unavailable");
  }
  if (status === 401) return new AccountDeletionProviderError(false, "provider_unauthorized");
  if (status === 403) return new AccountDeletionProviderError(false, "provider_forbidden");
  if (status !== undefined && status >= 400) {
    return new AccountDeletionProviderError(false, "provider_bad_request");
  }
  if (isTimeoutError(error)) return new AccountDeletionProviderError(true, "provider_timeout");
  return new AccountDeletionProviderError(true, "provider_network");
}

function assertLocalConfiguration(config: AccountDeletionConfiguration, expectedIssuer: string) {
  if (!config.secretKey || !config.publishableKey || !config.expectedIssuer) {
    throw new AccountDeletionProviderError(false, "provider_configuration_missing");
  }
  const normalizedExpectedIssuer = normalizeIssuer(expectedIssuer);
  const parsedKey = parsePublishableKey(config.publishableKey);
  if (
    !normalizedExpectedIssuer ||
    normalizedExpectedIssuer !== config.expectedIssuer ||
    !parsedKey ||
    parsedKey.frontendApi !== new URL(normalizedExpectedIssuer).hostname
  ) {
    throw new AccountDeletionProviderError(false, "provider_configuration_mismatch");
  }

  const developmentKeysMatch =
    isDevelopmentFromPublishableKey(config.publishableKey) && isDevelopmentFromSecretKey(config.secretKey);
  const productionKeysMatch =
    isProductionFromPublishableKey(config.publishableKey) && isProductionFromSecretKey(config.secretKey);
  if (!developmentKeysMatch && !productionKeysMatch) {
    throw new AccountDeletionProviderError(false, "provider_configuration_mismatch");
  }
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new DOMException("Provider request timed out", "TimeoutError")),
      ACCOUNT_DELETION_PROVIDER_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

function providerRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("retryAfter" in error) || typeof error.retryAfter !== "number") {
    return undefined;
  }
  return Math.min(Math.max(0, error.retryAfter * 1_000), ACCOUNT_DELETION_RETRY_MAX_MS);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
