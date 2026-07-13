import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StaffLegalConsent, type StaffLegalConsentPageData } from "@/src/components/features/StaffLegalConsent";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { StaffLayout } from "@/src/components/templates/StaffLayout";

type Props = {
  token: string | undefined;
};

const expiredConsentData: StaffLegalConsentPageData = {
  status: "expired",
  documents: {
    terms: {
      title: "スタッフ向け利用規約",
      documentVersion: "",
      requiredConsentVersion: "",
      path: "/terms/staff",
    },
    privacy: {
      title: "スタッフ向けプライバシーポリシー",
      documentVersion: "",
      requiredConsentVersion: "",
      path: "/privacy/staff",
    },
  },
};

export function StaffLegalConsentRoutePage({ token }: Props) {
  const data = useQuery(api.legal.queries.getStaffConsentPageData, token ? { token } : "skip");

  if (!token) {
    return (
      <StaffLayout shopName="規約の確認">
        <StaffLegalConsent token={token} data={expiredConsentData} />
      </StaffLayout>
    );
  }

  if (data === undefined) return <FullPageSpinner />;
  if (!data) return <FullPageSpinner />;

  const pageData = data as StaffLegalConsentPageData;

  const shopName = pageData.status === "expired" ? "規約の確認" : pageData.shopName;

  return (
    <StaffLayout shopName={shopName}>
      <StaffLegalConsent token={token} data={pageData} />
    </StaffLayout>
  );
}
