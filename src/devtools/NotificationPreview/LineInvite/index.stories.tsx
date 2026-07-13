import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildLineInviteEmailHtml } from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/LINE連携依頼",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="LINE連携依頼"
        subject={subject("シフト通知をLINEで受け取れます")}
        html={buildLineInviteEmailHtml({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          authorizeUrl: fixtures.authorizeUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
