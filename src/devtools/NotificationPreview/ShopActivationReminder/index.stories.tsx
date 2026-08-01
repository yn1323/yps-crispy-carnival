import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildShopActivationReminderEmailHtml,
  buildShopActivationReminderLineFlexMessage,
  SHOP_ACTIVATION_REMINDER_SUBJECT,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/本番募集リマインダー",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="本番募集リマインダー"
        subject={subject(SHOP_ACTIVATION_REMINDER_SUBJECT)}
        html={buildShopActivationReminderEmailHtml({
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
        label="本番募集リマインダー"
        message={buildShopActivationReminderLineFlexMessage({
          shopName: fixtures.shopName,
          dashboardUrl: fixtures.dashboardUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
