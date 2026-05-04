import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildConfirmationEmailHtml,
  buildRecruitmentEmailHtml,
  buildReissueEmailHtml,
  buildReminderEmailHtml,
} from "@/convex/email/templates";
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
  staffName: "山田 太郎",
  periodLabel: "2026年5月前半（5/1〜5/15）",
  deadline: "4/25(金)",
  magicLinkUrl: "https://example.com/shifts/view?token=preview-token",
  reissueUrl: "https://example.com/shifts/reissue?staff=preview",
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

const Section = ({ label, html }: { label: string; html: string }) => (
  <Flex direction="column" gap={2}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      {label}
    </Text>
    <EmailPreview html={html} />
  </Flex>
);

const VariantsContainer = ({ children }: { children: React.ReactNode }) => (
  <Flex direction="row" wrap="wrap" gap={8} p={6} alignItems="flex-start">
    {children}
  </Flex>
);

export const Confirmation: StoryObj<typeof meta> = {
  render: () => (
    <VariantsContainer>
      <Section
        label="新規確定"
        html={buildConfirmationEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          shifts: fixtures.shifts,
          magicLinkUrl: fixtures.magicLinkUrl,
          reissueUrl: fixtures.reissueUrl,
          isResend: false,
        })}
      />
      <Section
        label="変更通知（再送）"
        html={buildConfirmationEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          shifts: fixtures.shifts,
          magicLinkUrl: fixtures.magicLinkUrl,
          reissueUrl: fixtures.reissueUrl,
          isResend: true,
        })}
      />
      <Section
        label="全休"
        html={buildConfirmationEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          shifts: fixtures.shiftsAllRest,
          magicLinkUrl: fixtures.magicLinkUrl,
          reissueUrl: fixtures.reissueUrl,
          isResend: false,
        })}
      />
    </VariantsContainer>
  ),
};

export const Recruitment: StoryObj<typeof meta> = {
  render: () => (
    <VariantsContainer>
      <Section
        label="募集開始"
        html={buildRecruitmentEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          deadline: fixtures.deadline,
          magicLinkUrl: fixtures.magicLinkUrl,
        })}
      />
    </VariantsContainer>
  ),
};

export const Reminder: StoryObj<typeof meta> = {
  render: () => (
    <VariantsContainer>
      <Section
        label="未提出リマインダー"
        html={buildReminderEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          linkExpiresAtLabel: "5/6(月) 15:30",
          magicLinkUrl: fixtures.magicLinkUrl,
        })}
      />
    </VariantsContainer>
  ),
};

export const Reissue: StoryObj<typeof meta> = {
  render: () => (
    <VariantsContainer>
      <Section
        label="リンク再発行"
        html={buildReissueEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          magicLinkUrl: fixtures.magicLinkUrl,
        })}
      />
    </VariantsContainer>
  ),
};
