import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildReminderEmailHtml,
  buildReminderEmailSubject,
  buildReminderLineFlexMessage,
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
  title: "devtools/NotificationPreview/未提出リマインダー",
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
        label="未提出リマインダー"
        subject={subject(buildReminderEmailSubject(fixtures.periodLabel))}
        html={buildReminderEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          linkExpiresAtLabel: fixtures.deadline,
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
        label="未提出リマインダー・LINE再連携"
        subject={subject(buildReminderEmailSubject(fixtures.periodLabel))}
        html={buildReminderEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          linkExpiresAtLabel: fixtures.deadline,
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
        label="未提出リマインダー・LINE案内なし"
        subject={subject(buildReminderEmailSubject(fixtures.periodLabel))}
        html={buildReminderEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          linkExpiresAtLabel: fixtures.deadline,
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
        label="未提出リマインダー"
        message={buildReminderLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          linkExpiresAtLabel: fixtures.deadline,
          magicLinkUrl: fixtures.submitLinkUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
