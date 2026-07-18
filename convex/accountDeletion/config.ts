import { env } from "../_generated/server";

export type AccountDeletionConfiguration = {
  enabled: boolean;
  appOrigin: string | null;
  secretKey: string;
  publishableKey: string;
  expectedInstanceId: string;
  expectedIssuer: string;
};

export function getAccountDeletionConfiguration(): AccountDeletionConfiguration {
  return {
    enabled: (env.ACCOUNT_DELETION_ENABLED ?? "").trim().toLowerCase() === "true",
    appOrigin: parseOrigin(env.APP_URL ?? ""),
    secretKey: (env.CLERK_SECRET_KEY ?? "").trim(),
    publishableKey: (env.CLERK_PUBLISHABLE_KEY ?? "").trim(),
    expectedInstanceId: (env.CLERK_EXPECTED_INSTANCE_ID ?? "").trim(),
    expectedIssuer: normalizeIssuer(env.CLERK_JWT_ISSUER_DOMAIN ?? "") ?? "",
  };
}

export function hasRequiredAccountDeletionConfiguration(config: AccountDeletionConfiguration): boolean {
  return Boolean(
    config.appOrigin && config.secretKey && config.publishableKey && config.expectedInstanceId && config.expectedIssuer,
  );
}

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const isLoopbackHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (
      (url.protocol !== "https:" && !isLoopbackHttp) ||
      url.origin === "null" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeIssuer(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || (url.pathname !== "/" && url.pathname !== "")) return null;
    if (url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}
