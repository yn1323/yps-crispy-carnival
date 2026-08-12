import { describe, expect, it } from "vitest";
import { isOrganizationBillingContact } from "./billingContact";

describe("isOrganizationBillingContact", () => {
  it("正規化済み請求先メールと人物メールの表記揺れを同一として扱う", () => {
    expect(
      isOrganizationBillingContact(
        { billingEmail: "legacy@example.com", billingEmailNormalized: " billing@example.com " },
        { emailNormalized: "BILLING@EXAMPLE.COM" },
      ),
    ).toBe(true);
  });

  it("正規化済み請求先メールがない既存組織では請求先メールへfallbackする", () => {
    expect(
      isOrganizationBillingContact(
        { billingEmail: " Billing@Example.com " },
        { emailNormalized: "billing@example.com" },
      ),
    ).toBe(true);
  });

  it("請求先メールが空の場合は一致扱いにしない", () => {
    expect(isOrganizationBillingContact({}, { emailNormalized: "billing@example.com" })).toBe(false);
  });
});
