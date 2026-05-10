import { Box, Checkbox, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LegalDocumentLink } from "@/src/components/features/LegalDocumentLink";
import { Button } from "@/src/components/ui/Button";

export type LegalReconsentDocumentLinks = {
  terms: { title: string; path: string };
  privacy: { title: string; path: string };
};

type Props = {
  documents: LegalReconsentDocumentLinks;
  isSubmitting?: boolean;
  onAccept: () => Promise<void>;
};

export function LegalReconsentBanner({ documents, isSubmitting = false, onAccept }: Props) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!checked) {
      setError("利用規約とプライバシーポリシーに同意してください");
      return;
    }
    setError(null);
    await onAccept();
  };

  return (
    <Box bg="teal.50" borderWidth={1} borderColor="teal.200" borderRadius="lg" px={{ base: 4, md: 5 }} py={4}>
      <Flex gap={4} direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }}>
        <Box flex={1}>
          <Text fontWeight="semibold" color="teal.900">
            利用規約・プライバシーポリシーを更新しました
          </Text>
          <Text mt={1} fontSize="sm" color="teal.800" lineHeight={1.7}>
            内容をご確認のうえ、同意をお願いします。確認中でもダッシュボードの操作は続けられます。
          </Text>
          <Box mt={3}>
            <Checkbox.Root
              colorPalette="teal"
              checked={checked}
              onCheckedChange={(details) => {
                setChecked(details.checked === true);
                if (details.checked === true) setError(null);
              }}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label fontSize="sm" lineHeight={1.7} color="teal.950">
                <LegalDocumentLink href={documents.terms.path}>利用規約</LegalDocumentLink>と
                <LegalDocumentLink href={documents.privacy.path}>プライバシーポリシー</LegalDocumentLink>
                に同意します
              </Checkbox.Label>
            </Checkbox.Root>
            {error && (
              <Text mt={2} fontSize="xs" color="red.600">
                {error}
              </Text>
            )}
          </Box>
        </Box>
        <Button
          colorPalette="teal"
          alignSelf={{ base: "stretch", md: "center" }}
          loading={isSubmitting}
          onClick={handleAccept}
        >
          OK
        </Button>
      </Flex>
    </Box>
  );
}
