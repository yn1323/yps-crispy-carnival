import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { describe, expect, it } from "vitest";
import {
  buildGoogleDisconnectPlan,
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

  describe("Google連携解除plan", () => {
    it("確認済みPrimaryとGoogleメールが同じならEmailAddressを削除対象にしない", () => {
      const primary = emailAddress("email-primary", " Staff@Example.com ", "verified");
      const google = externalAccount(
        "google-current",
        "google",
        "staff@example.com",
        "verified",
        "identification-google-current",
      );
      const user = userResource({
        passwordEnabled: true,
        primaryEmailAddressId: primary.id,
        emailAddresses: [primary],
        externalAccounts: [google],
      });

      expect(buildGoogleDisconnectPlan(user, google)).toEqual({ status: "externalOnly" });
    });

    it.each([
      { emailAddress: "google@example.com", providerUserId: "provider-user-other" },
      { emailAddress: "other@example.com", providerUserId: "provider-user-google-current" },
    ])("同じGoogleメールまたはprovider userのresourceが複数ある場合は解除対象を推測しない", (duplicate) => {
      const primary = emailAddress("email-primary", "login@example.com", "verified");
      const googleEmail = emailAddress("email-google", "google@example.com", "verified", [
        { id: "identification-google-current", type: "oauth_google" },
      ]);
      const google = externalAccount(
        "google-current",
        "google",
        "google@example.com",
        "verified",
        "identification-google-current",
      );
      const duplicateGoogle = {
        ...externalAccount(
          "google-duplicate",
          "google",
          duplicate.emailAddress,
          "verified",
          "identification-google-duplicate",
        ),
        providerUserId: duplicate.providerUserId,
      } as ExternalAccountResource;
      const user = userResource({
        passwordEnabled: true,
        primaryEmailAddressId: primary.id,
        emailAddresses: [primary, googleEmail],
        externalAccounts: [google, duplicateGoogle],
      });

      expect(buildGoogleDisconnectPlan(user, google)).toEqual({ status: "unavailable" });
    });

    it("GoogleメールがPrimaryと異なる場合はexact linkを持つ一意な非Primary EmailAddressだけを返す", () => {
      const primary = emailAddress("email-primary", "login@example.com", "verified");
      const googleEmail = emailAddress("email-google", " Google@Example.com ", "verified", [
        { id: "identification-google-current", type: "oauth_google" },
      ]);
      const unrelated = emailAddress("email-unrelated", "unrelated@example.com", "verified");
      const google = externalAccount(
        "google-current",
        "google",
        "google@example.com",
        "verified",
        "identification-google-current",
      );
      const user = userResource({
        passwordEnabled: true,
        primaryEmailAddressId: primary.id,
        emailAddresses: [primary, googleEmail, unrelated],
        externalAccounts: [google],
      });

      expect(buildGoogleDisconnectPlan(user, google)).toEqual({
        status: "externalAndEmail",
        emailAddress: googleEmail,
      });
    });

    it.each([
      {
        label: "passwordがない",
        passwordEnabled: false,
        primaryStatus: "verified" as const,
        linkedTo: [{ id: "identification-google-current", type: "oauth_google" }],
        googleEmailStatus: "verified" as const,
      },
      {
        label: "Primaryが未確認",
        passwordEnabled: true,
        primaryStatus: "unverified" as const,
        linkedTo: [{ id: "identification-google-current", type: "oauth_google" }],
        googleEmailStatus: "verified" as const,
      },
      {
        label: "identificationIdが一致しない",
        passwordEnabled: true,
        primaryStatus: "verified" as const,
        linkedTo: [{ id: "identification-other", type: "oauth_google" }],
        googleEmailStatus: "verified" as const,
      },
      {
        label: "link typeがGoogle OAuthではない",
        passwordEnabled: true,
        primaryStatus: "verified" as const,
        linkedTo: [{ id: "identification-google-current", type: "oauth_github" }],
        googleEmailStatus: "verified" as const,
      },
      {
        label: "Googleメールが未確認",
        passwordEnabled: true,
        primaryStatus: "verified" as const,
        linkedTo: [{ id: "identification-google-current", type: "oauth_google" }],
        googleEmailStatus: "unverified" as const,
      },
      {
        label: "対象以外のlinkもある",
        passwordEnabled: true,
        primaryStatus: "verified" as const,
        linkedTo: [
          { id: "identification-google-current", type: "oauth_google" },
          { id: "identification-other", type: "oauth_google" },
        ],
        googleEmailStatus: "verified" as const,
      },
    ])("$label場合は削除対象を推測しない", ({ passwordEnabled, primaryStatus, linkedTo, googleEmailStatus }) => {
      const primary = emailAddress("email-primary", "login@example.com", primaryStatus);
      const googleEmail = emailAddress("email-google", "google@example.com", googleEmailStatus, linkedTo);
      const google = externalAccount(
        "google-current",
        "google",
        "google@example.com",
        "verified",
        "identification-google-current",
      );
      const user = userResource({
        passwordEnabled,
        primaryEmailAddressId: primary.id,
        emailAddresses: [primary, googleEmail],
        externalAccounts: [google],
      });

      expect(buildGoogleDisconnectPlan(user, google)).toEqual({ status: "unavailable" });
    });

    it("同じGoogleメール候補が複数ある場合はexact linkが一つでも削除対象を推測しない", () => {
      const primary = emailAddress("email-primary", "login@example.com", "verified");
      const first = emailAddress("email-google-first", "google@example.com", "verified", [
        { id: "identification-google-current", type: "oauth_google" },
      ]);
      const second = emailAddress("email-google-second", " GOOGLE@EXAMPLE.COM ", "verified");
      const google = externalAccount(
        "google-current",
        "google",
        "google@example.com",
        "verified",
        "identification-google-current",
      );
      const user = userResource({
        passwordEnabled: true,
        primaryEmailAddressId: primary.id,
        emailAddresses: [primary, first, second],
        externalAccounts: [google],
      });

      expect(buildGoogleDisconnectPlan(user, google)).toEqual({ status: "unavailable" });
    });

    it("Gmailのdotやplusを同一視せず通常のtrim・小文字化だけで比較する", () => {
      const primary = emailAddress("email-primary", "staff.name@gmail.com", "verified");
      const googleEmail = emailAddress("email-google", "staffname+shiftori@gmail.com", "verified", [
        { id: "identification-google-current", type: "oauth_google" },
      ]);
      const google = externalAccount(
        "google-current",
        "google",
        "staffname+shiftori@gmail.com",
        "verified",
        "identification-google-current",
      );
      const user = userResource({
        passwordEnabled: true,
        primaryEmailAddressId: primary.id,
        emailAddresses: [primary, googleEmail],
        externalAccounts: [google],
      });

      expect(buildGoogleDisconnectPlan(user, google)).toEqual({
        status: "externalAndEmail",
        emailAddress: googleEmail,
      });
    });
  });
});

function emailAddress(
  id: string,
  email: string,
  status: "verified" | "unverified",
  linkedTo: Array<{ id: string; type: string }> = [],
) {
  return {
    id,
    emailAddress: email,
    verification: { status },
    linkedTo,
  } as unknown as EmailAddressResource;
}

function externalAccount(
  id: string,
  provider: string,
  email: string,
  status: "verified" | "unverified",
  identificationId = `identification-${id}`,
) {
  return {
    id,
    identificationId,
    providerUserId: `provider-user-${id}`,
    provider,
    emailAddress: email,
    verification: { status },
  } as unknown as ExternalAccountResource;
}

function userResource({
  passwordEnabled,
  primaryEmailAddressId,
  emailAddresses,
  externalAccounts,
}: {
  passwordEnabled: boolean;
  primaryEmailAddressId: string | null;
  emailAddresses: EmailAddressResource[];
  externalAccounts: ExternalAccountResource[];
}) {
  return {
    passwordEnabled,
    primaryEmailAddressId,
    emailAddresses,
    externalAccounts,
  } as unknown as UserResource;
}
