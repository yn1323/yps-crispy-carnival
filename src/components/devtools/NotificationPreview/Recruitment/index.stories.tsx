import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildRecruitmentEmailHtml, buildRecruitmentLineFlexMessage } from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  notificationPreviewLineCtaHtml as lineCtaHtml,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/募集開始",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集開始"
        subject={subject(`${fixtures.periodLabel} シフト希望の提出をお願いします`)}
        html={buildRecruitmentEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          deadline: fixtures.deadline,
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
        label="募集開始"
        message={buildRecruitmentLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          deadline: fixtures.deadline,
          magicLinkUrl: fixtures.submitLinkUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
