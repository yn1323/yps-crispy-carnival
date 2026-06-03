import { Box, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { StaffGuideContent } from "@/src/components/features/StaffGuideContent";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { LegalConsentPanel } from "./LegalConsentPanel";

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
    <Box
      minH="100dvh"
      px={{ base: 3, md: 0 }}
      mt={{ base: `calc(${HEADER_HEIGHT.base} * -1)`, md: `calc(${HEADER_HEIGHT.md} * -1)` }}
      pt={0}
      pb={{ base: 4, md: 8 }}
    >
      <VStack align="stretch" gap={{ base: 4, md: 6 }} w="full" maxW="960px" mx="auto">
        <StaffGuideContent heroTopOffset={HEADER_HEIGHT} />
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
