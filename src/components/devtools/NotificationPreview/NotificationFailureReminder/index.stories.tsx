import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildNotificationFailureReminderEmailHtml,
  buildNotificationFailureReminderLineFlexMessage,
  NOTIFICATION_FAILURE_REMINDER_SUBJECT,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/通知失敗ダイジェスト",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="通知失敗ダイジェスト"
        subject={subject(NOTIFICATION_FAILURE_REMINDER_SUBJECT)}
        html={buildNotificationFailureReminderEmailHtml({
          managerName: fixtures.managerName,
          dashboardUrl: fixtures.dashboardUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINE: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="通知失敗ダイジェスト"
        message={buildNotificationFailureReminderLineFlexMessage({
          shopName: fixtures.shopName,
          dashboardUrl: fixtures.dashboardUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
