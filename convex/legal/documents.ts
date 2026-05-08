export type LegalAudience = "manager" | "staff";
export type LegalDocumentKind = "terms" | "privacy";

export type LegalConsentMethod =
  | "manager_setup"
  | "staff_email_link"
  | "line_link_notice"
  | "shift_submit"
  | "manager_reconsent";

export type LegalDocumentInfo = {
  audience: LegalAudience;
  kind: LegalDocumentKind;
  title: string;
  version: string;
  path: string;
};

export type LegalConsentSnapshot = {
  legalTermsVersion?: string;
  legalPrivacyVersion?: string;
  legalConsentedAt?: number;
  legalConsentMethod?: LegalConsentMethod | string;
};

export const LEGAL_DOCUMENTS = {
  manager: {
    terms: {
      audience: "manager",
      kind: "terms",
      title: "管理ユーザー向け利用規約",
      version: "manager-terms-2026-05-09",
      path: "/terms/manager",
    },
    privacy: {
      audience: "manager",
      kind: "privacy",
      title: "管理ユーザー向けプライバシーポリシー",
      version: "manager-privacy-2026-05-09",
      path: "/privacy/manager",
    },
  },
  staff: {
    terms: {
      audience: "staff",
      kind: "terms",
      title: "スタッフ向け利用規約",
      version: "staff-terms-2026-05-09",
      path: "/terms/staff",
    },
    privacy: {
      audience: "staff",
      kind: "privacy",
      title: "スタッフ向けプライバシーポリシー",
      version: "staff-privacy-2026-05-09",
      path: "/privacy/staff",
    },
  },
} as const satisfies Record<LegalAudience, Record<LegalDocumentKind, LegalDocumentInfo>>;

export function getLegalDocumentsForAudience(audience: LegalAudience) {
  return LEGAL_DOCUMENTS[audience];
}

export function getLegalConsentVersions(audience: LegalAudience) {
  const documents = getLegalDocumentsForAudience(audience);
  return {
    termsVersion: documents.terms.version,
    privacyVersion: documents.privacy.version,
  };
}

export function hasCurrentLegalConsent(
  consent: LegalConsentSnapshot | null | undefined,
  audience: LegalAudience,
): boolean {
  if (!consent) return false;
  const current = getLegalConsentVersions(audience);
  return consent.legalTermsVersion === current.termsVersion && consent.legalPrivacyVersion === current.privacyVersion;
}
