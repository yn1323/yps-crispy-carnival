import { normalizeEmail } from "../_lib/validation";

type OrganizationBillingContactSource = {
  billingEmail?: string;
  billingEmailNormalized?: string;
};

type OrganizationBillingContactPerson = {
  emailNormalized: string;
};

/** 組織の請求先メールと人物の正規化メールが一致するかを判定する。 */
export function isOrganizationBillingContact(
  organization: OrganizationBillingContactSource,
  person: OrganizationBillingContactPerson,
) {
  const billingEmail = normalizeEmail(organization.billingEmailNormalized ?? organization.billingEmail ?? "");
  return billingEmail.length > 0 && billingEmail === normalizeEmail(person.emailNormalized);
}
