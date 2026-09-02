import type { LegalDocumentLinks } from "@/convex/legal/documents";

export type StaffLegalDocumentLinks = LegalDocumentLinks;

export type StaffLegalConsentPageData =
  | {
      status: "ok";
      staffName: string;
      shopName: string;
      expiresAt: number;
      documents: StaffLegalDocumentLinks;
    }
  | {
      status: "accepted";
      staffName: string;
      shopName: string;
      documents: StaffLegalDocumentLinks;
    }
  | {
      status: "expired";
      documents: StaffLegalDocumentLinks;
    };
