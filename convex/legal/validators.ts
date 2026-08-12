import { v } from "convex/values";
import type { LegalAudience, LegalDocumentKind } from "./documents";

function createLegalDocumentValidator<TAudience extends LegalAudience, TKind extends LegalDocumentKind>(
  audience: TAudience,
  kind: TKind,
) {
  return v.object({
    audience: v.literal(audience),
    kind: v.literal(kind),
    title: v.string(),
    documentVersion: v.string(),
    requiredConsentVersion: v.string(),
    path: v.string(),
  });
}

export const managerLegalDocumentsValidator = v.object({
  terms: createLegalDocumentValidator("manager", "terms"),
  privacy: createLegalDocumentValidator("manager", "privacy"),
});

export const staffLegalDocumentsValidator = v.object({
  terms: createLegalDocumentValidator("staff", "terms"),
  privacy: createLegalDocumentValidator("staff", "privacy"),
});
