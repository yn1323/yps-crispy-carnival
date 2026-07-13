import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { StaffLegalConsentView } from "./ConsentView";
import type { StaffLegalConsentPageData } from "./types";

type Props = {
  token: string | undefined;
  data: StaffLegalConsentPageData;
};

export function StaffLegalConsent({ token, data }: Props) {
  const accept = useMutation(api.legal.mutations.acceptStaffLegalConsent);
  const [acceptedData, setAcceptedData] = useState<StaffLegalConsentPageData | null>(null);
  const pageData = acceptedData ?? data;
  const { run: handleAccept, isRunning: isSubmitting } = useSingleFlight(async () => {
    if (!token) return;

    try {
      const result = await accept({ token, acceptedLegal: true });
      if (result.status === "ok" && pageData.status === "ok") {
        setAcceptedData({
          status: "accepted",
          staffName: pageData.staffName,
          shopName: pageData.shopName,
          documents: pageData.documents,
        });
        showSuccessToast({ title: "同意を記録しました" });
        return;
      }

      toaster.create({ title: "リンクの有効期限が切れています", type: "error" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return <StaffLegalConsentView data={pageData} isSubmitting={isSubmitting} onAccept={handleAccept} />;
}

export type { StaffLegalConsentPageData } from "./types";
