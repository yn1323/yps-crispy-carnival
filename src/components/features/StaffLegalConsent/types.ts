export type StaffLegalDocumentLinks = {
  terms: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
  privacy: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
};

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
