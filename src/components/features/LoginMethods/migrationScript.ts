import {
  type EmailPasswordMigrationPhase,
  type GoogleOAuthMigrationFlow,
  LOGIN_METHOD_MIGRATION_FLOWS,
  type LoginMethodMigrationFlow,
} from "./migrationTypes";
import type { LoginMethodsUserSnapshot } from "./types";

export type EmailPasswordMigrationDerivation = {
  phase: EmailPasswordMigrationPhase;
  targetEmailAddressId: string | null;
};

export function isLoginMethodMigrationFlow(value: unknown): value is LoginMethodMigrationFlow {
  return typeof value === "string" && LOGIN_METHOD_MIGRATION_FLOWS.some((flow) => flow === value);
}

export function acceptsGoogleOAuthMarker(flow: LoginMethodMigrationFlow | undefined): flow is GoogleOAuthMigrationFlow {
  return flow === "connect-google";
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

export function hasEmailPasswordMethod(snapshot: LoginMethodsUserSnapshot): boolean {
  return snapshot.passwordEnabled && snapshot.emailAddresses.some((email) => email.verificationStatus === "verified");
}

export function deriveEmailPasswordMigration(
  snapshot: LoginMethodsUserSnapshot,
  targetEmailAddressId: string | null = null,
): EmailPasswordMigrationDerivation {
  if (targetEmailAddressId) {
    const target = snapshot.emailAddresses.find((email) => email.id === targetEmailAddressId);
    if (!target) return { phase: "choosingEmail", targetEmailAddressId: null };
    if (target.verificationStatus !== "verified") {
      return { phase: "verifyingEmail", targetEmailAddressId: target.id };
    }
    return {
      phase: snapshot.passwordEnabled ? "methodReady" : "settingPassword",
      targetEmailAddressId: target.id,
    };
  }

  if (hasEmailPasswordMethod(snapshot)) {
    return { phase: "methodReady", targetEmailAddressId: null };
  }
  return { phase: "choosingEmail", targetEmailAddressId: null };
}

export function canStartGoogleConnection(snapshot: LoginMethodsUserSnapshot): boolean {
  return !hasAnyGoogle(snapshot) && hasEmailPasswordMethod(snapshot);
}
