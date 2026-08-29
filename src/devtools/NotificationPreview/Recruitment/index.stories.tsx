import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildRecruitmentEmailHtml,
  buildRecruitmentEmailSubject,
  buildRecruitmentLineFlexMessage,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  notificationPreviewLineCtaHtml as lineCtaHtml,
  notificationPreviewLineReCtaHtml as lineReCtaHtml,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/募集開始",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  name: "メール（LINE連携）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集開始"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel))}
        html={buildRecruitmentEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          deadline: fixtures.deadline,
          magicLinkUrl: fixtures.submitLinkUrl,
          lineCtaHtml,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const EmailLineRelink: Story = {
  name: "メール（LINE再連携）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集開始・LINE再連携"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel))}
        html={buildRecruitmentEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          deadline: fixtures.deadline,
          magicLinkUrl: fixtures.submitLinkUrl,
          lineCtaHtml: lineReCtaHtml,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const EmailWithoutLineCta: Story = {
  name: "メール（LINE案内なし）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集開始・LINE案内なし"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel))}
        html={buildRecruitmentEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          deadline: fixtures.deadline,
          magicLinkUrl: fixtures.submitLinkUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINE: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="募集開始"
        message={buildRecruitmentLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          deadline: fixtures.deadline,
          magicLinkUrl: fixtures.submitLinkUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
