import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { normalizeEmail } from "@/convex/_lib/validation";

type EmailAddressOwner = Pick<UserResource, "emailAddresses" | "primaryEmailAddressId">;
type ExternalAccountOwner = Pick<UserResource, "externalAccounts">;
type LoginMethodOwner = Pick<UserResource, "emailAddresses" | "passwordEnabled">;

export function findLoginEmailAddress(
  user: Pick<UserResource, "emailAddresses">,
  id: string | null,
  normalizedEmail?: string,
) {
  if (id) {
    const byId = user.emailAddresses.find((emailAddress) => emailAddress.id === id);
    if (byId) return byId;
  }
  if (!normalizedEmail) return undefined;
  return user.emailAddresses.find((emailAddress) => normalizeEmail(emailAddress.emailAddress) === normalizedEmail);
}

export function findVerifiedPrimaryLoginEmailAddress(user: EmailAddressOwner) {
  if (!user.primaryEmailAddressId) return undefined;
  const primaryEmail = findLoginEmailAddress(user, user.primaryEmailAddressId);
  return isVerifiedLoginEmailAddress(primaryEmail) ? primaryEmail : undefined;
}

export function isVerifiedLoginEmailAddress(
  emailAddress: EmailAddressResource | undefined,
): emailAddress is EmailAddressResource {
  return emailAddress?.verification?.status === "verified";
}

export function getGoogleExternalAccounts(user: ExternalAccountOwner) {
  return user.externalAccounts.filter((account) => account.provider === "google");
}

export function hasEmailPasswordLoginMethod(user: LoginMethodOwner) {
  return user.passwordEnabled && user.emailAddresses.some(isVerifiedLoginEmailAddress);
}

export function getGoogleExternalAccountStateKeys(user: ExternalAccountOwner) {
  return getGoogleExternalAccounts(user).map((account) => `${account.id}:${account.verification?.status ?? "unknown"}`);
}

export function haveSameStringValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function isVerifiedOwnedGoogleExternalAccount(
  user: Pick<UserResource, "emailAddresses">,
  account: ExternalAccountResource,
) {
  return (
    account.provider === "google" &&
    account.verification?.status === "verified" &&
    user.emailAddresses.some(
      (emailAddress) =>
        isVerifiedLoginEmailAddress(emailAddress) &&
        normalizeEmail(emailAddress.emailAddress) === normalizeEmail(account.emailAddress),
    )
  );
}
