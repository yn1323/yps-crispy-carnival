import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildConfirmationEmailHtml, buildShiftConfirmationLineFlexMessage } from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  notificationPreviewLineCtaHtml as lineCtaHtml,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/シフト変更",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="シフト変更通知"
        subject={subject(`${fixtures.periodLabel} シフト変更のお知らせ`)}
        html={buildConfirmationEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          shifts: fixtures.shifts,
          magicLinkUrl: fixtures.magicLinkUrl,
          reissueUrl: fixtures.reissueUrl,
          isResend: true,
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
        label="シフト変更通知"
        message={buildShiftConfirmationLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          shifts: fixtures.shifts,
          magicLinkUrl: fixtures.magicLinkUrl,
          isResend: true,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
