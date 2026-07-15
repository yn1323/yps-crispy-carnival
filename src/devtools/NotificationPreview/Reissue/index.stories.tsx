import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildReissueEmailHtml, buildReissueLineFlexMessage } from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/閲覧リンク再発行",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="閲覧リンク再発行"
        subject={subject(`${fixtures.periodLabel} シフト閲覧リンク`)}
        html={buildReissueEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          magicLinkUrl: fixtures.magicLinkUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINE: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="閲覧リンク再発行"
        message={buildReissueLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          magicLinkUrl: fixtures.magicLinkUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
