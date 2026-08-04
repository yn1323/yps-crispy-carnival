import {
  type EmailPasswordMigrationPhase,
  type EmailPasswordMigrationPurpose,
  type GoogleOAuthMigrationFlow,
  type GoogleReplacementPhase,
  LOGIN_METHOD_MIGRATION_FLOWS,
  type LoginMethodMigrationFlow,
} from "./migrationTypes";
import type { LoginMethodsEmailSnapshot, LoginMethodsUserSnapshot } from "./types";

export type EmailPasswordMigrationDerivation = {
  phase: EmailPasswordMigrationPhase;
  targetEmailAddressId: string | null;
};

export type GoogleReplacementCapabilityInput = {
  replaceGoogleAccount: boolean;
  setPassword: boolean;
  disconnectGoogle: boolean;
  connectGoogle: boolean;
};

export function isLoginMethodMigrationFlow(value: unknown): value is LoginMethodMigrationFlow {
  return typeof value === "string" && LOGIN_METHOD_MIGRATION_FLOWS.some((flow) => flow === value);
}

export function acceptsGoogleOAuthMarker(flow: LoginMethodMigrationFlow | undefined): flow is GoogleOAuthMigrationFlow {
  return flow === "connect-google" || flow === "replace-google";
}

export function buildGoogleOAuthReturnPath(flow: GoogleOAuthMigrationFlow): string {
  return `/account/security?flow=${flow}&oauth=google`;
}

export function hasVerifiedGoogle(snapshot: LoginMethodsUserSnapshot): boolean {
  return snapshot.externalAccounts.some(
    (account) => account.provider === "google" && account.verificationStatus === "verified",
  );
}

export function hasAnyGoogle(snapshot: LoginMethodsUserSnapshot): boolean {
  return snapshot.externalAccounts.some((account) => account.provider === "google");
}

export function isSafeFallbackEmail(email: LoginMethodsEmailSnapshot): boolean {
  return email.verificationStatus === "verified" && email.linkedTo.length === 0;
}

export function findSafeFallbackEmail(snapshot: LoginMethodsUserSnapshot): LoginMethodsEmailSnapshot | undefined {
  return snapshot.emailAddresses.find(isSafeFallbackEmail);
}

export function hasEmailPasswordMethod(snapshot: LoginMethodsUserSnapshot): boolean {
  return snapshot.passwordEnabled && snapshot.emailAddresses.some((email) => email.verificationStatus === "verified");
}

export function hasSafeEmailPasswordFallback(snapshot: LoginMethodsUserSnapshot): boolean {
  return snapshot.passwordEnabled && Boolean(findSafeFallbackEmail(snapshot));
}

export function deriveEmailPasswordMigration(
  snapshot: LoginMethodsUserSnapshot,
  purpose: EmailPasswordMigrationPurpose,
  targetEmailAddressId: string | null = null,
): EmailPasswordMigrationDerivation {
  const target = targetEmailAddressId
    ? snapshot.emailAddresses.find((email) => email.id === targetEmailAddressId)
    : undefined;

  if (target) {
    if (purpose === "ensure-unlinked-fallback" && target.linkedTo.length > 0) {
      return { phase: "choosingEmail", targetEmailAddressId: null };
    }
    if (target.verificationStatus !== "verified") {
      return { phase: "verifyingEmail", targetEmailAddressId: target.id };
    }
    return {
      phase: snapshot.passwordEnabled ? "methodReady" : "settingPassword",
      targetEmailAddressId: target.id,
    };
  }

  if (purpose === "ensure-unlinked-fallback") {
    const fallback = findSafeFallbackEmail(snapshot);
    if (fallback) {
      return {
        phase: snapshot.passwordEnabled ? "methodReady" : "settingPassword",
        targetEmailAddressId: fallback.id,
      };
    }
    return { phase: "choosingEmail", targetEmailAddressId: null };
  }

  if (hasEmailPasswordMethod(snapshot)) {
    return { phase: "methodReady", targetEmailAddressId: null };
  }
  return { phase: "choosingEmail", targetEmailAddressId: null };
}

export function canStartGoogleConnection(snapshot: LoginMethodsUserSnapshot, flow: GoogleOAuthMigrationFlow): boolean {
  if (hasAnyGoogle(snapshot)) return false;
  return flow === "replace-google" ? hasSafeEmailPasswordFallback(snapshot) : hasEmailPasswordMethod(snapshot);
}

export function hasEffectiveGoogleReplacementCapability(capabilities: GoogleReplacementCapabilityInput): boolean {
  return (
    capabilities.replaceGoogleAccount &&
    capabilities.setPassword &&
    capabilities.disconnectGoogle &&
    capabilities.connectGoogle
  );
}

export function deriveGoogleReplacementPhase(
  snapshot: LoginMethodsUserSnapshot,
  capabilities: GoogleReplacementCapabilityInput,
  oldGoogleAccountId: string | null,
): GoogleReplacementPhase {
  if (!hasEffectiveGoogleReplacementCapability(capabilities)) return "unavailable";
  const googleAccounts = snapshot.externalAccounts.filter((account) => account.provider === "google");
  if (!oldGoogleAccountId) return "unavailable";

  const oldGoogle = googleAccounts.find((account) => account.id === oldGoogleAccountId);
  if (oldGoogle) {
    if (googleAccounts.length !== 1 || oldGoogle.verificationStatus !== "verified") return "unavailable";
    if (!hasSafeEmailPasswordFallback(snapshot)) return "ensuringFallback";
    return "fallbackReady";
  }

  if (!hasSafeEmailPasswordFallback(snapshot)) return "unavailable";
  if (googleAccounts.length === 0) return "connectingNewGoogle";
  if (googleAccounts.length === 1 && googleAccounts[0]?.verificationStatus !== "verified") {
    return "connectingNewGoogle";
  }
  if (
    googleAccounts.length === 1 &&
    googleAccounts[0]?.verificationStatus === "verified" &&
    googleAccounts[0].id !== oldGoogleAccountId
  ) {
    return "newGoogleReady";
  }
  return "unavailable";
}
