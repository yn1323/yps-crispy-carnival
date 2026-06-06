import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  StaffLegalConsentPage,
  type StaffLegalConsentPageData,
} from "@/src/components/features/StaffLegalConsent/ConsentPage";
import { useAcceptStaffLegalConsent } from "@/src/components/features/StaffLegalConsent/useAcceptStaffLegalConsent";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";

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
  const accept = useAcceptStaffLegalConsent(token ?? "");
  const [acceptedData, setAcceptedData] = useState<StaffLegalConsentPageData | null>(null);
  const pageData = acceptedData ?? (data as StaffLegalConsentPageData | undefined);
  const { run: handleAccept, isRunning: isSubmitting } = useSingleFlight(async () => {
    if (!pageData) return;

    try {
      const result = await accept();
      if (result.status === "ok" && pageData.status === "ok") {
        setAcceptedData({
          status: "accepted",
          staffName: pageData.staffName,
          shopName: pageData.shopName,
          documents: pageData.documents,
        });
        toaster.create({ title: "同意を記録しました", type: "success" });
      } else {
        toaster.create({ title: "リンクの有効期限が切れています", type: "error" });
      }
    } catch (error) {
      showErrorToast(error);
    }
  });

  if (!token) {
    return (
      <StaffLayout shopName="規約の確認">
        <StaffLegalConsentPage data={expiredConsentData} />
      </StaffLayout>
    );
  }

  if (data === undefined) return <FullPageSpinner />;

  if (!pageData) return <FullPageSpinner />;

  const shopName = pageData.status === "expired" ? "規約の確認" : pageData.shopName;

  return (
    <StaffLayout shopName={shopName}>
      <StaffLegalConsentPage data={pageData} isSubmitting={isSubmitting} onAccept={handleAccept} />
    </StaffLayout>
  );
}
