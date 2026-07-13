import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { LegalReconsentDocumentLinks } from "../LegalReconsentBanner";
import { LegalReconsentView } from "./LegalReconsentView";

type Props = {
  status?: {
    required: boolean;
    documents: LegalReconsentDocumentLinks;
  };
};

export function LegalReconsent({ status }: Props) {
  const acceptManagerLegalConsent = useShopMutation(api.legal.mutations.acceptManagerLegalConsent);
  const { run: handleAccept, isRunning: isSubmitting } = useSingleFlight(async () => {
    try {
      await acceptManagerLegalConsent({ acceptedLegal: true });
      showSuccessToast({ title: "同意を記録しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return (
    <LegalReconsentView
      documents={status?.required ? status.documents : null}
      isSubmitting={isSubmitting}
      onAccept={handleAccept}
    />
  );
}
