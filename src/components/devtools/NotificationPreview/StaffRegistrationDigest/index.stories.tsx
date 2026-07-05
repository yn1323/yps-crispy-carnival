import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildStaffRegistrationOwnerDigestEmailHtml,
  buildStaffRegistrationOwnerDigestLineFlexMessage,
  STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/スタッフ参加承認依頼",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="スタッフ参加承認依頼"
        subject={subject(STAFF_REGISTRATION_OWNER_DIGEST_SUBJECT)}
        html={buildStaffRegistrationOwnerDigestEmailHtml({
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
        label="スタッフ参加承認依頼"
        message={buildStaffRegistrationOwnerDigestLineFlexMessage({
          shopName: fixtures.shopName,
          dashboardUrl: fixtures.dashboardUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
