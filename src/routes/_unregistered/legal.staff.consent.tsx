import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  StaffLegalConsentPage,
  type StaffLegalConsentPageData,
} from "@/src/components/features/StaffLegalConsent/ConsentPage";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/_unregistered/legal/staff/consent")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "規約の確認", noindex: true }),
  }),
  component: StaffLegalConsentRoute,
});

function StaffLegalConsentRoute() {
  const { token } = Route.useSearch();
  const data = useQuery(api.legal.queries.getStaffConsentPageData, token ? { token } : "skip");
  const accept = useMutation(api.legal.mutations.acceptStaffLegalConsent);
  const [isSubmitting, setSubmitting] = useState(false);
  const [acceptedData, setAcceptedData] = useState<StaffLegalConsentPageData | null>(null);

  if (!token) {
    return (
      <StaffLayout shopName="規約の確認">
        <StaffLegalConsentPage
          data={{
            status: "expired",
            documents: {
              terms: { title: "スタッフ向け利用規約", version: "", path: "/terms/staff" },
              privacy: { title: "スタッフ向けプライバシーポリシー", version: "", path: "/privacy/staff" },
            },
          }}
        />
      </StaffLayout>
    );
  }

  if (data === undefined) return <FullPageSpinner />;

  const pageData = acceptedData ?? (data as StaffLegalConsentPageData);
  const shopName = pageData.status === "expired" ? "規約の確認" : pageData.shopName;

  const handleAccept = async () => {
    try {
      setSubmitting(true);
      const result = await accept({ token, acceptedLegal: true });
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffLayout shopName={shopName}>
      <StaffLegalConsentPage data={pageData} isSubmitting={isSubmitting} onAccept={handleAccept} />
    </StaffLayout>
  );
}
