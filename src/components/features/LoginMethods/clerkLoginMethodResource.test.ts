import type { EmailAddressResource, ExternalAccountResource } from "@clerk/shared/types";
import { describe, expect, it } from "vitest";
import {
  findLoginEmailAddress,
  findVerifiedPrimaryLoginEmailAddress,
  getGoogleExternalAccountStateKeys,
  getGoogleExternalAccounts,
  hasEmailPasswordLoginMethod,
  haveSameStringValues,
  isVerifiedOwnedGoogleExternalAccount,
} from "./clerkLoginMethodResource";

describe("Clerkログイン方法resource判定", () => {
  it("IDを優先し、必要な場合は正規化済みメールで検索する", () => {
    const primary = emailAddress("email-primary", "Staff@Example.com", "verified");
    const secondary = emailAddress("email-secondary", "other@example.com", "verified");
    const user = { emailAddresses: [primary, secondary] };

    expect(findLoginEmailAddress(user, primary.id, "other@example.com")).toBe(primary);
    expect(findLoginEmailAddress(user, null, "staff@example.com")).toBe(primary);
  });

  it("確認済みのprimaryメールだけをログイン方法として返す", () => {
    const unverified = emailAddress("email-primary", "staff@example.com", "unverified");
    const user = {
      emailAddresses: [unverified],
      primaryEmailAddressId: unverified.id,
    };

    expect(findVerifiedPrimaryLoginEmailAddress(user)).toBeUndefined();

    const verified = emailAddress("email-primary", "staff@example.com", "verified");
    expect(
      findVerifiedPrimaryLoginEmailAddress({
        emailAddresses: [verified],
        primaryEmailAddressId: verified.id,
      }),
    ).toBe(verified);
  });

  it("メールとパスワードのfallbackには確認済みメールとpasswordEnabledの両方を要求する", () => {
    const verified = emailAddress("email-primary", "staff@example.com", "verified");
    const unverified = emailAddress("email-pending", "pending@example.com", "unverified");

    expect(hasEmailPasswordLoginMethod({ emailAddresses: [verified], passwordEnabled: true })).toBe(true);
    expect(hasEmailPasswordLoginMethod({ emailAddresses: [verified], passwordEnabled: false })).toBe(false);
    expect(hasEmailPasswordLoginMethod({ emailAddresses: [unverified], passwordEnabled: true })).toBe(false);
  });

  it("Google accountだけを抽出し、状態比較用keyを安定して生成する", () => {
    const connected = externalAccount("google-connected", "google", "staff@example.com", "verified");
    const pending = externalAccount("google-pending", "google", "other@example.com", "unverified");
    const github = externalAccount("github-account", "github", "staff@example.com", "verified");
    const user = { externalAccounts: [connected, pending, github] };

    expect(getGoogleExternalAccounts(user)).toEqual([connected, pending]);
    expect(getGoogleExternalAccountStateKeys(user)).toEqual(["google-connected:verified", "google-pending:unverified"]);
    expect(haveSameStringValues(["a", "b"], ["b", "a"])).toBe(true);
    expect(haveSameStringValues(["a"], ["a", "b"])).toBe(false);
  });

  it("所有Userの確認済みメールと一致する確認済みGoogle accountだけを許可する", () => {
    const verifiedEmail = emailAddress("email-primary", "Staff@Example.com", "verified");
    const user = { emailAddresses: [verifiedEmail] };
    const owned = externalAccount("google-owned", "google", "staff@example.com", "verified");
    const foreign = externalAccount("google-foreign", "google", "other@example.com", "verified");
    const pending = externalAccount("google-pending", "google", "staff@example.com", "unverified");

    expect(isVerifiedOwnedGoogleExternalAccount(user, owned)).toBe(true);
    expect(isVerifiedOwnedGoogleExternalAccount(user, foreign)).toBe(false);
    expect(isVerifiedOwnedGoogleExternalAccount(user, pending)).toBe(false);
  });
});

function emailAddress(id: string, email: string, status: "verified" | "unverified") {
  return {
    id,
    emailAddress: email,
    verification: { status },
  } as unknown as EmailAddressResource;
}

function externalAccount(id: string, provider: string, email: string, status: "verified" | "unverified") {
  return {
    id,
    provider,
    emailAddress: email,
    verification: { status },
  } as unknown as ExternalAccountResource;
}
