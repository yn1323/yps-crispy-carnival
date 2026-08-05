import type { EmailPasswordMigrationPhase } from "./migrationTypes";
import type { LoginMethodsUserSnapshot } from "./types";

type EmailPasswordMigrationDerivation = {
  phase: EmailPasswordMigrationPhase;
  targetEmailAddressId: string | null;
};

function hasEmailPasswordMethod(snapshot: LoginMethodsUserSnapshot): boolean {
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
