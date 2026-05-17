import { Box, Checkbox, Circle, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCircleCheck, LuClock, LuFileCheck2 } from "react-icons/lu";
import { LegalDocumentLink } from "@/src/components/features/LegalDocumentLink";
import { Button } from "@/src/components/ui/Button";
import type { StaffLegalConsentPageData } from "./index";

type Props = {
  data: StaffLegalConsentPageData;
  checked: boolean;
  error: string | null;
  isSubmitting: boolean;
  onCheckedChange: (checked: boolean) => void;
  onAccept: () => Promise<void>;
};

export function LegalConsentPanel({ data, checked, error, isSubmitting, onCheckedChange, onAccept }: Props) {
  if (data.status === "expired") {
    return (
      <PanelFrame tone="neutral" icon={<LuClock />} title="リンクの有効期限が切れています">
        <Text color="fg.muted" lineHeight={1.8}>
          この同意リンクは現在利用できません。
          <br />
          同意していない場合でも、お店からの通知は届きます。
          <br />
          初回シフト提出時に同意欄がありますので、その際ご確認ください。
        </Text>
        <LegalDocumentLinks data={data} />
      </PanelFrame>
    );
  }

  if (data.status === "accepted") {
    return (
      <PanelFrame tone="success" icon={<LuCircleCheck />} title="同意済みです">
        <Text color="fg.muted" lineHeight={1.8}>
          利用規約・プライバシーポリシーへの同意は完了しています。
        </Text>
        <LegalDocumentLinks data={data} />
      </PanelFrame>
    );
  }

  return (
    <PanelFrame tone="action" icon={<LuFileCheck2 />} title="利用規約・プライバシーポリシーの確認">
      <VStack align="stretch" gap={4}>
        <Text color="fg.muted" lineHeight={1.8}>
          内容をご確認のうえ、同意をお願いします。
        </Text>
        <Box>
          <Checkbox.Root
            colorPalette="teal"
            checked={checked}
            cursor="pointer"
            onCheckedChange={(details) => onCheckedChange(details.checked === true)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg="white"
              borderColor="gray.300"
              cursor="pointer"
              _checked={{ bg: "teal.500", borderColor: "teal.500" }}
            />
            <Checkbox.Label fontSize="sm" lineHeight={1.7} cursor="pointer">
              <LegalLink href={data.documents.terms.path}>利用規約</LegalLink>と
              <LegalLink href={data.documents.privacy.path}>プライバシーポリシー</LegalLink>
              に同意します
            </Checkbox.Label>
          </Checkbox.Root>
          {error && (
            <Text mt={2} color="red.600" fontSize="xs">
              {error}
            </Text>
          )}
        </Box>
        <Button colorPalette="teal" h="48px" borderRadius="lg" loading={isSubmitting} onClick={onAccept}>
          同意する
        </Button>
      </VStack>
    </PanelFrame>
  );
}

function PanelFrame({
  tone,
  icon,
  title,
  children,
}: {
  tone: "action" | "success" | "neutral";
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const styles = {
    action: { bg: "teal.50", iconBg: "teal.500", iconColor: "white" },
    success: { bg: "green.50", iconBg: "green.500", iconColor: "white" },
    neutral: { bg: "gray.50", iconBg: "gray.500", iconColor: "white" },
  }[tone];

  return (
    <Box bg={styles.bg} p={{ base: 5, md: 6 }}>
      <VStack align="stretch" gap={4}>
        <HStack gap={3} align="center">
          <Circle size="36px" bg={styles.iconBg} color={styles.iconColor} flexShrink={0}>
            {icon}
          </Circle>
          <Text as="h2" color="gray.900" fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">
            {title}
          </Text>
        </HStack>
        {children}
      </VStack>
    </Box>
  );
}

function LegalDocumentLinks({ data }: { data: StaffLegalConsentPageData }) {
  return (
    <Flex gap={3} wrap="wrap">
      <LegalLink href={data.documents.terms.path}>{formatDocumentTitle(data.documents.terms.title)}</LegalLink>
      <LegalLink href={data.documents.privacy.path}>{formatDocumentTitle(data.documents.privacy.title)}</LegalLink>
    </Flex>
  );
}

function formatDocumentTitle(title: string) {
  return title.replace(/^スタッフ向け/, "");
}

function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <LegalDocumentLink href={href} fontWeight="semibold">
      {children}
    </LegalDocumentLink>
  );
}
