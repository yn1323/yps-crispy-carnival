import { Box, Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { formatResendSubject } from "@/convex/_lib/emailFormat";
import {
  buildConfirmationEmailHtml,
  buildLineCtaSection,
  buildLineDefaultReplyText,
  buildLineInviteEmailHtml,
  buildRecruitmentEmailHtml,
  buildRecruitmentLineText,
  buildReissueEmailHtml,
  buildReissueLineText,
  buildReminderEmailHtml,
  buildReminderLineText,
  buildShiftConfirmationLineText,
  buildStaffLegalConsentEmailHtml,
  buildStaffLegalConsentLineText,
  buildStaffRegistrationOwnerDigestEmailHtml,
  buildStaffRegistrationOwnerDigestLineText,
  STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT,
} from "@/convex/notification/templates";
import { EmailPreview } from ".";

const meta = {
  title: "devtools/EmailPreview",
  component: EmailPreview,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    html: "",
  },
} satisfies Meta<typeof EmailPreview>;
export default meta;

const fixtures = {
  shopName: "居酒屋さくら",
  managerName: "佐藤 店長",
  staffName: "山田 太郎",
  periodLabel: "2026年5月前半（5/1〜5/15）",
  deadline: "4/25(金)",
  magicLinkUrl: "https://example.com/shifts/view?token=preview-token",
  submitLinkUrl: "https://example.com/shifts/submit?token=preview-token",
  reissueUrl: "https://example.com/shifts/reissue?recruitmentId=preview",
  consentUrl: "https://example.com/legal/staff/consent?token=preview-token",
  authorizeUrl: "https://example.com/line/callback?state=preview-token",
  dashboardUrl: "https://example.com/dashboard",
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

const legalDocuments = {
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
    documentVersion: "staff-privacy-doc-2026-05-09",
    path: "/privacy/staff",
    requiredConsentVersion: "staff-privacy-consent-2026-05-09",
  },
} as const;

type EmailNotificationPreview = {
  label: string;
  subject: string;
  html: string;
};

type LineMessagePreview = {
  label: string;
  text: string;
};

const subject = (text: string) => formatResendSubject(fixtures.shopName, text);
const lineCtaHtml = buildLineCtaSection({ authorizeUrl: fixtures.authorizeUrl, reLink: false });

const emailNotifications: EmailNotificationPreview[] = [
  {
    label: "募集開始",
    subject: subject(`${fixtures.periodLabel} シフト希望の提出をお願いします`),
    html: buildRecruitmentEmailHtml({
      staffName: fixtures.staffName,
      periodLabel: fixtures.periodLabel,
      deadline: fixtures.deadline,
      magicLinkUrl: fixtures.submitLinkUrl,
      lineCtaHtml,
    }),
  },
  {
    label: "未提出リマインダー",
    subject: subject(`${fixtures.periodLabel} シフト希望の提出をお待ちしています（${fixtures.deadline}まで）`),
    html: buildReminderEmailHtml({
      staffName: fixtures.staffName,
      periodLabel: fixtures.periodLabel,
      linkExpiresAtLabel: fixtures.deadline,
      magicLinkUrl: fixtures.submitLinkUrl,
      lineCtaHtml,
    }),
  },
  {
    label: "シフト確定",
    subject: subject(`${fixtures.periodLabel} シフト確定のお知らせ`),
    html: buildConfirmationEmailHtml({
      staffName: fixtures.staffName,
      periodLabel: fixtures.periodLabel,
      shifts: fixtures.shifts,
      magicLinkUrl: fixtures.magicLinkUrl,
      reissueUrl: fixtures.reissueUrl,
      isResend: false,
      lineCtaHtml,
    }),
  },
  {
    label: "シフト変更通知",
    subject: subject(`${fixtures.periodLabel} シフト変更のお知らせ`),
    html: buildConfirmationEmailHtml({
      staffName: fixtures.staffName,
      periodLabel: fixtures.periodLabel,
      shifts: fixtures.shifts,
      magicLinkUrl: fixtures.magicLinkUrl,
      reissueUrl: fixtures.reissueUrl,
      isResend: true,
      lineCtaHtml,
    }),
  },
  {
    label: "シフト確定（全休）",
    subject: subject(`${fixtures.periodLabel} シフト確定のお知らせ`),
    html: buildConfirmationEmailHtml({
      staffName: fixtures.staffName,
      periodLabel: fixtures.periodLabel,
      shifts: fixtures.shiftsAllRest,
      magicLinkUrl: fixtures.magicLinkUrl,
      reissueUrl: fixtures.reissueUrl,
      isResend: false,
      lineCtaHtml,
    }),
  },
  {
    label: "閲覧リンク再発行",
    subject: subject(`${fixtures.periodLabel} シフト閲覧リンク`),
    html: buildReissueEmailHtml({
      staffName: fixtures.staffName,
      periodLabel: fixtures.periodLabel,
      magicLinkUrl: fixtures.magicLinkUrl,
    }),
  },
  {
    label: "LINE連携依頼",
    subject: subject("シフト通知をLINEで受け取れます"),
    html: buildLineInviteEmailHtml({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      authorizeUrl: fixtures.authorizeUrl,
    }),
  },
  {
    label: "LINE連携依頼（参加承認後）",
    subject: subject("シフト通知をLINEで受け取れます"),
    html: buildLineInviteEmailHtml({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      authorizeUrl: fixtures.authorizeUrl,
      context: "registration_approved",
    }),
  },
  {
    label: "スタッフ法務同意",
    subject: subject("シフトリの使い方と利用規約・プライバシーポリシーの確認"),
    html: buildStaffLegalConsentEmailHtml({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      consentUrl: fixtures.consentUrl,
      expiresAt: fixtures.expiresAt,
      documents: legalDocuments,
    }),
  },
  {
    label: "スタッフ参加承認依頼",
    subject: subject(STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT),
    html: buildStaffRegistrationOwnerDigestEmailHtml({
      managerName: fixtures.managerName,
      dashboardUrl: fixtures.dashboardUrl,
    }),
  },
];

const lineMessages: LineMessagePreview[] = [
  {
    label: "募集開始",
    text: buildRecruitmentLineText({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      periodLabel: fixtures.periodLabel,
      deadline: fixtures.deadline,
      magicLinkUrl: fixtures.submitLinkUrl,
    }),
  },
  {
    label: "未提出リマインダー",
    text: buildReminderLineText({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      periodLabel: fixtures.periodLabel,
      linkExpiresAtLabel: fixtures.deadline,
      magicLinkUrl: fixtures.submitLinkUrl,
    }),
  },
  {
    label: "シフト確定",
    text: buildShiftConfirmationLineText({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      periodLabel: fixtures.periodLabel,
      shifts: fixtures.shifts,
      magicLinkUrl: fixtures.magicLinkUrl,
      isResend: false,
    }),
  },
  {
    label: "シフト変更通知",
    text: buildShiftConfirmationLineText({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      periodLabel: fixtures.periodLabel,
      shifts: fixtures.shifts,
      magicLinkUrl: fixtures.magicLinkUrl,
      isResend: true,
    }),
  },
  {
    label: "シフト確定（全休）",
    text: buildShiftConfirmationLineText({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      periodLabel: fixtures.periodLabel,
      shifts: fixtures.shiftsAllRest,
      magicLinkUrl: fixtures.magicLinkUrl,
      isResend: false,
    }),
  },
  {
    label: "閲覧リンク再発行",
    text: buildReissueLineText({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      periodLabel: fixtures.periodLabel,
      magicLinkUrl: fixtures.magicLinkUrl,
    }),
  },
  {
    label: "スタッフ法務同意",
    text: buildStaffLegalConsentLineText({
      staffName: fixtures.staffName,
      shopName: fixtures.shopName,
      consentUrl: fixtures.consentUrl,
      expiresAt: fixtures.expiresAt,
    }),
  },
  {
    label: "スタッフ参加承認依頼",
    text: buildStaffRegistrationOwnerDigestLineText({
      dashboardUrl: fixtures.dashboardUrl,
    }),
  },
  {
    label: "Webhook通常返信",
    text: buildLineDefaultReplyText(),
  },
];

const CatalogContainer = ({ children }: { children: ReactNode }) => (
  <Flex direction="column" gap={6} p={6} bg="gray.50" minH="100vh">
    {children}
  </Flex>
);

const EmailSection = ({ label, subject, html }: EmailNotificationPreview) => (
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

const LineMessageSection = ({ label, text }: LineMessagePreview) => (
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

export const EmailNotifications: StoryObj<typeof meta> = {
  render: () => (
    <CatalogContainer>
      <Flex direction="row" wrap="wrap" gap={8} alignItems="flex-start">
        {emailNotifications.map((notification) => (
          <EmailSection key={notification.label} {...notification} />
        ))}
      </Flex>
    </CatalogContainer>
  ),
};

export const LineMessages: StoryObj<typeof meta> = {
  render: () => (
    <CatalogContainer>
      <Flex direction="row" wrap="wrap" gap={4} alignItems="flex-start">
        {lineMessages.map((message) => (
          <LineMessageSection key={message.label} {...message} />
        ))}
      </Flex>
    </CatalogContainer>
  ),
};
