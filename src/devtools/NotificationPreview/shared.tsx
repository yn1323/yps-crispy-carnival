import { Box, Flex, Text } from "@chakra-ui/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { formatResendSubject } from "@/convex/_lib/emailFormat";
import { buildLineCtaSection } from "@/convex/notification/templates";
import { Button } from "@/src/components/ui/Button";
import { EmailPreview } from "../EmailPreview";
import { FlexMessagePreview } from "../FlexMessagePreview";

export const notificationPreviewFixtures = {
  shopName: "居酒屋さくら",
  organizationName: "さくらフードサービス",
  managerName: "佐藤 店長",
  inviterName: "鈴木 花子",
  staffName: "山田 太郎",
  periodLabel: "2026年5月前半（5/1〜5/15）",
  deadline: "4/25(金)",
  magicLinkUrl: "https://example.com/shifts/view?token=preview-token",
  submitLinkUrl: "https://example.com/shifts/submit?token=preview-token",
  reissueUrl: "https://example.com/shifts/reissue?recruitmentId=preview",
  consentUrl: "https://example.com/legal/staff/consent?token=preview-token",
  authorizeUrl: "https://example.com/line/callback?state=preview-token",
  dashboardUrl: "https://example.com/dashboard",
  managerInvitationUrl: "https://example.com/manager-invite?token=preview-token",
  managerSettingsUrl: "https://example.com/manage/managers?org=preview-organization",
  expiresAt: new Date("2026-05-31T12:00:00+09:00").getTime(),
  shifts: [
    { date: "5/1(金)", startTime: "09:00", endTime: "13:00" },
    { date: "5/2(土)", startTime: "17:00", endTime: "22:00" },
    { date: "5/3(日)", startTime: null, endTime: null },
    { date: "5/4(月)", startTime: "09:00", endTime: "18:00" },
  ],
  shiftsAllRest: [
    { date: "5/1(金)", startTime: null, endTime: null },
    { date: "5/2(土)", startTime: null, endTime: null },
    { date: "5/3(日)", startTime: null, endTime: null },
  ],
};

export const legalDocuments = {
  terms: {
    audience: "staff",
    kind: "terms",
    title: "スタッフ向け利用規約",
    documentVersion: "staff-terms-doc-2026-05-09",
    path: "/terms/staff",
    requiredConsentVersion: "staff-terms-consent-2026-05-09",
  },
  privacy: {
    audience: "staff",
    kind: "privacy",
    title: "スタッフ向けプライバシーポリシー",
    documentVersion: "staff-privacy-doc-2026-08-13",
    path: "/privacy/staff",
    requiredConsentVersion: "staff-privacy-consent-2026-08-13",
  },
} as const;

type EmailNotificationPreview = {
  label: string;
  subject: string;
  html: string;
};

type TextLineNotificationPreview = {
  label: string;
  text: string;
};

type FlexLineNotificationPreview = {
  label: string;
  message: unknown;
};

type CopyState = "idle" | "copied" | "failed";

export const notificationPreviewSubject = (text: string) =>
  formatResendSubject(notificationPreviewFixtures.shopName, text);

export const notificationPreviewOrganizationSubject = (text: string) =>
  formatResendSubject(notificationPreviewFixtures.organizationName, text);

export const notificationPreviewLineCtaHtml = buildLineCtaSection({
  authorizeUrl: notificationPreviewFixtures.authorizeUrl,
  reLink: false,
});

export const NotificationPreviewStoryFrame = ({ children }: { children?: ReactNode }) => (
  <Flex direction="column" gap={6} p={6} bg="gray.50" minH="100vh">
    {children}
  </Flex>
);

export const EmailNotificationPreview = ({ label, subject, html }: EmailNotificationPreview) => (
  <Flex direction="column" gap={3} width="480px" maxW="100%">
    <Box>
      <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
        {label}
      </Text>
      <Text mt={1} fontSize="sm" fontWeight="medium" color="gray.900" lineHeight="short">
        {subject}
      </Text>
    </Box>
    <EmailPreview html={html} width="100%" />
  </Flex>
);

export const TextLineNotificationPreview = ({ label, text }: TextLineNotificationPreview) => (
  <Flex
    direction="column"
    gap={3}
    width="360px"
    maxW="100%"
    p={4}
    bg="white"
    border="1px solid"
    borderColor="gray.200"
    borderRadius="md"
  >
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      {label}
    </Text>
    <Box
      as="pre"
      m={0}
      whiteSpace="pre-wrap"
      fontFamily="body"
      fontSize="sm"
      lineHeight="1.8"
      color="gray.900"
      wordBreak="break-word"
    >
      {text}
    </Box>
  </Flex>
);

export const FlexLineNotificationPreview = ({ label, message }: FlexLineNotificationPreview) => {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<number | null>(null);
  const simulatorJson = useMemo(() => getFlexSimulatorJson(message), [message]);
  const simulatorJsonText = useMemo(
    () => JSON.stringify(simulatorJson, null, 2) ?? String(simulatorJson),
    [simulatorJson],
  );

  useEffect(() => {
    console.log(simulatorJson);
  }, [simulatorJson]);

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(simulatorJsonText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopyState("idle"), 1500);
  };

  return (
    <Flex direction="column" gap={3} width="400px" maxW="100%">
      <Flex align="center" justify="space-between" gap={3}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
          {label}
        </Text>
        <Button onClick={handleCopy} variant="outline" size="xs" colorPalette="teal" gap={1.5}>
          {copyState === "copied" ? <LuCheck /> : <LuCopy />}
          {copyState === "copied" ? "コピーしました" : copyState === "failed" ? "コピー失敗" : "JSONをコピー"}
        </Button>
      </Flex>
      <Box overflow="hidden" borderRadius="md" border="1px solid" borderColor="gray.200">
        <FlexMessagePreview message={message} />
      </Box>
    </Flex>
  );
};

function getFlexSimulatorJson(message: unknown): unknown {
  if (typeof message === "object" && message !== null && "contents" in message) {
    return (message as { contents: unknown }).contents;
  }
  return message;
}
