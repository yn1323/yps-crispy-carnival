import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildShiftConfirmationReminderEmailHtml,
  buildShiftConfirmationReminderLineFlexMessage,
  SHIFT_CONFIRMATION_REMINDER_SUBJECT,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/シフト確定リマインダー",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="シフト確定リマインダー"
        subject={subject(SHIFT_CONFIRMATION_REMINDER_SUBJECT)}
        html={buildShiftConfirmationReminderEmailHtml({
          managerName: fixtures.managerName,
          periodLabel: fixtures.periodLabel,
          deadlineLabel: "4/25(金) 23:59",
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
        label="シフト確定リマインダー"
        message={buildShiftConfirmationReminderLineFlexMessage({
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          deadlineLabel: "4/25(金) 23:59",
          dashboardUrl: fixtures.dashboardUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
