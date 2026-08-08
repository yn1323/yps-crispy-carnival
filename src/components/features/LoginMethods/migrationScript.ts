import type { EmailPasswordMigrationPhase } from "./migrationTypes";
import type { LoginMethodsUserSnapshot } from "./types";

type EmailPasswordMigrationDerivation = {
  phase: EmailPasswordMigrationPhase;
  targetEmailAddressId: string | null;
};

function hasEmailPasswordMethod(snapshot: LoginMethodsUserSnapshot): boolean {
  const primaryEmail = snapshot.emailAddresses.find((email) => email.id === snapshot.primaryEmailAddressId);
  return snapshot.passwordEnabled && primaryEmail?.verificationStatus === "verified";
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
      phase:
        snapshot.passwordEnabled && snapshot.primaryEmailAddressId === target.id ? "methodReady" : "settingPassword",
      targetEmailAddressId: target.id,
    };
  }

  if (hasEmailPasswordMethod(snapshot)) {
    return { phase: "methodReady", targetEmailAddressId: null };
  }
  return { phase: "choosingEmail", targetEmailAddressId: null };
}
