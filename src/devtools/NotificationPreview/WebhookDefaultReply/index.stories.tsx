import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildLineDefaultReplyText } from "@/convex/notification/templates";
import { NotificationPreviewStoryFrame, TextLineNotificationPreview } from "../shared";

const meta = {
  title: "devtools/NotificationPreview/Webhook通常返信",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LINE: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <TextLineNotificationPreview label="Webhook通常返信" text={buildLineDefaultReplyText()} />
    </NotificationPreviewStoryFrame>
  ),
};
