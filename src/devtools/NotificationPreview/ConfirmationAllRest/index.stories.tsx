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
  title: "devtools/NotificationPreview/シフト確定（全休）",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="シフト確定（全休）"
        subject={subject(`${fixtures.periodLabel} シフト確定のお知らせ`)}
        html={buildConfirmationEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          shifts: fixtures.shiftsAllRest,
          magicLinkUrl: fixtures.magicLinkUrl,
          reissueUrl: fixtures.reissueUrl,
          isResend: false,
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
        label="シフト確定（全休）"
        message={buildShiftConfirmationLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          shifts: fixtures.shiftsAllRest,
          magicLinkUrl: fixtures.magicLinkUrl,
          isResend: false,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
