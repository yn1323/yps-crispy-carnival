import { Box, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { LegalConsentPanel } from "./LegalConsentPanel";
import { StaffGuideContent } from "./StaffGuideContent";

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

type Props = {
  data: StaffLegalConsentPageData;
  isSubmitting?: boolean;
  onAccept?: () => Promise<void>;
};

export function StaffLegalConsentPage({ data, isSubmitting = false, onAccept }: Props) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!checked) {
      setError("利用規約とプライバシーポリシーに同意してください");
      return;
    }
    setError(null);
    await onAccept?.();
  };

  return (
    <Box minH="calc(100dvh - 48px)" px={{ base: 3, md: 0 }} pt={0} pb={{ base: 4, md: 8 }}>
      <VStack align="stretch" gap={{ base: 4, md: 6 }} w="full" maxW="960px" mx="auto">
        <StaffGuideContent />
        <Box px={{ base: 4, md: 8 }} pb={{ base: 5, md: 8 }}>
          <LegalConsentPanel
            data={data}
            checked={checked}
            error={error}
            isSubmitting={isSubmitting}
            onCheckedChange={(nextChecked) => {
              setChecked(nextChecked);
              if (nextChecked) setError(null);
            }}
            onAccept={handleAccept}
          />
        </Box>
      </VStack>
    </Box>
  );
}
