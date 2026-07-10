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
  title: "devtools/NotificationPreview/送れなかった通知",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="送れなかった通知"
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
        label="送れなかった通知"
        message={buildNotificationFailureReminderLineFlexMessage({
          shopName: fixtures.shopName,
          dashboardUrl: fixtures.dashboardUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
