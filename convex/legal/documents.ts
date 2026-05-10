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
  documentVersion: string;
  requiredConsentVersion: string;
  path: string;
};

export const LEGAL_DOCUMENTS = {
  manager: {
    terms: {
      audience: "manager",
      kind: "terms",
      title: "管理ユーザー向け利用規約",
      documentVersion: "manager-terms-doc-2026-05-09",
      requiredConsentVersion: "manager-terms-consent-2026-05-09",
      path: "/terms/manager",
    },
    privacy: {
      audience: "manager",
      kind: "privacy",
      title: "管理ユーザー向けプライバシーポリシー",
      documentVersion: "manager-privacy-doc-2026-05-09",
      requiredConsentVersion: "manager-privacy-consent-2026-05-09",
      path: "/privacy/manager",
    },
  },
  staff: {
    terms: {
      audience: "staff",
      kind: "terms",
      title: "スタッフ向け利用規約",
      documentVersion: "staff-terms-doc-2026-05-09",
      requiredConsentVersion: "staff-terms-consent-2026-05-09",
      path: "/terms/staff",
    },
    privacy: {
      audience: "staff",
      kind: "privacy",
      title: "スタッフ向けプライバシーポリシー",
      documentVersion: "staff-privacy-doc-2026-05-09",
      requiredConsentVersion: "staff-privacy-consent-2026-05-09",
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
    termsConsentVersion: documents.terms.requiredConsentVersion,
    privacyConsentVersion: documents.privacy.requiredConsentVersion,
    termsDocumentVersion: documents.terms.documentVersion,
    privacyDocumentVersion: documents.privacy.documentVersion,
  };
}
