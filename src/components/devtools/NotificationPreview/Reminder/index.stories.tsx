import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildReminderEmailHtml, buildReminderLineFlexMessage } from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  notificationPreviewLineCtaHtml as lineCtaHtml,
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
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="未提出リマインダー"
        subject={subject(`${fixtures.periodLabel} シフト希望の提出をお待ちしています（${fixtures.deadline}まで）`)}
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
