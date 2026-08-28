import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildReissueLineFlexMessage } from "@/convex/notification/templates";
import {
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/LINE Flex代替テキスト境界",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Over1500Characters: Story = {
  name: "1500文字超（末尾を省略）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="閲覧リンク再発行・代替テキスト1500文字超"
        message={buildReissueLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          magicLinkUrl: fixtures.longFlexUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
