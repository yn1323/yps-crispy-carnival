export type StaffRegistrationPageData =
  | {
      status: "ok";
      shopName: string;
      documents: {
        terms: { title: string; path: string };
        privacy: { title: string; path: string };
      };
    }
  | {
      status: "expired";
      documents: {
        terms: { title: string; path: string };
        privacy: { title: string; path: string };
      };
    };
