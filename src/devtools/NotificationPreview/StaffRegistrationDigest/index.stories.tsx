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
  title: "devtools/NotificationPreview/スタッフ登録申請",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="スタッフ登録申請"
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
        label="スタッフ登録申請"
        message={buildStaffRegistrationOwnerDigestLineFlexMessage({
          shopName: fixtures.shopName,
          dashboardUrl: fixtures.dashboardUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
