import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { normalizeEmail } from "@/convex/_lib/validation";

type EmailAddressOwner = Pick<UserResource, "emailAddresses" | "primaryEmailAddressId">;
type ExternalAccountOwner = Pick<UserResource, "externalAccounts">;
type LoginMethodOwner = Pick<UserResource, "emailAddresses" | "passwordEnabled">;
type GoogleDisconnectOwner = Pick<
  UserResource,
  "emailAddresses" | "externalAccounts" | "passwordEnabled" | "primaryEmailAddressId"
>;

export type GoogleDisconnectPlan =
  | { status: "externalOnly" }
  | { status: "externalAndEmail"; emailAddress: EmailAddressResource }
  | { status: "unavailable" };

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

export function buildGoogleDisconnectPlan(
  user: GoogleDisconnectOwner,
  targetAccount: ExternalAccountResource,
): GoogleDisconnectPlan {
  const currentAccount = user.externalAccounts.find((account) => account.id === targetAccount.id);
  const primaryEmail = findVerifiedPrimaryLoginEmailAddress(user);
  if (
    !user.passwordEnabled ||
    !primaryEmail ||
    !currentAccount ||
    currentAccount.provider !== "google" ||
    currentAccount.verification?.status !== "verified" ||
    !currentAccount.identificationId ||
    currentAccount.identificationId !== targetAccount.identificationId ||
    !currentAccount.providerUserId ||
    currentAccount.providerUserId !== targetAccount.providerUserId
  ) {
    return { status: "unavailable" };
  }

  const googleEmail = normalizeEmail(currentAccount.emailAddress);
  const matchingGoogleAccounts = user.externalAccounts.filter(
    (account) =>
      account.provider === "google" &&
      (account.providerUserId === currentAccount.providerUserId ||
        normalizeEmail(account.emailAddress) === googleEmail),
  );
  if (matchingGoogleAccounts.length !== 1 || matchingGoogleAccounts[0]?.id !== currentAccount.id) {
    return { status: "unavailable" };
  }
  if (normalizeEmail(primaryEmail.emailAddress) === googleEmail) {
    return { status: "externalOnly" };
  }

  const candidates = user.emailAddresses.filter(
    (emailAddress) => emailAddress.id !== primaryEmail.id && normalizeEmail(emailAddress.emailAddress) === googleEmail,
  );

  const candidate = candidates[0];
  return candidates.length === 1 &&
    isVerifiedLoginEmailAddress(candidate) &&
    candidate?.linkedTo.length === 1 &&
    candidate.linkedTo[0]?.id === currentAccount.identificationId &&
    candidate.linkedTo[0]?.type === "oauth_google"
    ? { status: "externalAndEmail", emailAddress: candidate }
    : { status: "unavailable" };
}
