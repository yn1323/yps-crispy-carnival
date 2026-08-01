import { LegalReconsentBanner, type LegalReconsentDocumentLinks } from "../LegalReconsentBanner";

type Props = {
  documents: LegalReconsentDocumentLinks | null;
  isSubmitting: boolean;
  onAccept: () => Promise<void>;
};

export function LegalReconsentView({ documents, isSubmitting, onAccept }: Props) {
  if (!documents) return null;
  return <LegalReconsentBanner documents={documents} isSubmitting={isSubmitting} onAccept={onAccept} />;
}
