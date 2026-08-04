import type { UserResource } from "@clerk/shared/types";
import type { LoginMethodsUserSnapshot } from "./types";

export function toLoginMethodsUserSnapshot(user: UserResource): LoginMethodsUserSnapshot {
  return {
    primaryEmailAddressId: user.primaryEmailAddressId,
    passwordEnabled: user.passwordEnabled,
    emailAddresses: user.emailAddresses.map((emailAddress) => ({
      id: emailAddress.id,
      emailAddress: emailAddress.emailAddress,
      verificationStatus: emailAddress.verification?.status ?? null,
      linkedTo: emailAddress.linkedTo.map((link) => ({ id: link.id, type: link.type })),
    })),
    externalAccounts: user.externalAccounts.map((externalAccount) => ({
      id: externalAccount.id,
      provider: externalAccount.provider,
      emailAddress: externalAccount.emailAddress,
      verificationStatus: externalAccount.verification?.status ?? null,
    })),
  };
}
