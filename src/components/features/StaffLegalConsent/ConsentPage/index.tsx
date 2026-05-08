import { Box, Checkbox, Link, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/src/components/ui/Button";

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

  if (data.status === "expired") {
    return (
      <Frame title="リンクの有効期限が切れています">
        <Text color="fg.muted" lineHeight={1.8}>
          この同意リンクは利用できません。新しい案内が届いた場合はそちらから確認してください。シフト提出時にも同意できます。
        </Text>
      </Frame>
    );
  }

  if (data.status === "accepted") {
    return (
      <Frame title="同意済みです">
        <Text color="fg.muted" lineHeight={1.8}>
          {data.shopName} のシフト管理サービス利用に必要な同意は完了しています。
        </Text>
      </Frame>
    );
  }

  const handleAccept = async () => {
    if (!checked) {
      setError("利用規約とプライバシーポリシーに同意してください");
      return;
    }
    setError(null);
    await onAccept?.();
  };

  return (
    <Frame title="規約の確認">
      <VStack align="stretch" gap={5}>
        <Text color="fg.muted" lineHeight={1.8}>
          {data.staffName}さん、{data.shopName}{" "}
          が利用しているシフト管理SaaS「シフトリ」のスタッフ向け利用条件をご確認ください。
        </Text>
        <Box p={4} bg="gray.50" borderRadius="md" borderWidth={1} borderColor="border.default">
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
            <Checkbox.Label fontSize="sm" lineHeight={1.7}>
              <Link href={data.documents.terms.path} target="_blank" rel="noopener noreferrer" color="teal.700">
                利用規約
              </Link>
              と
              <Link href={data.documents.privacy.path} target="_blank" rel="noopener noreferrer" color="teal.700">
                プライバシーポリシー
              </Link>
              に同意します
            </Checkbox.Label>
          </Checkbox.Root>
          {error && (
            <Text mt={2} color="red.600" fontSize="xs">
              {error}
            </Text>
          )}
        </Box>
        <Button colorPalette="teal" h="48px" loading={isSubmitting} onClick={handleAccept}>
          同意する
        </Button>
        <Text fontSize="xs" color="fg.subtle" lineHeight={1.7}>
          未同意でもシフトのお知らせは引き続き受け取れます。シフト希望を提出するときには同意が必要です。
        </Text>
      </VStack>
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box maxW="560px" mx="auto" px={4} py={8}>
      <VStack align="stretch" gap={5} bg="white" borderWidth={1} borderColor="border.default" borderRadius="lg" p={5}>
        <Text fontSize="xl" fontWeight="bold">
          {title}
        </Text>
        {children}
      </VStack>
    </Box>
  );
}
