import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildOrganizationManagerInvitationEmailHtml,
  buildOrganizationManagerInvitationLineText,
  ORGANIZATION_MANAGER_INVITATION_SUBJECT,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewOrganizationSubject as organizationSubject,
  TextLineNotificationPreview,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/組織管理者招待",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="組織管理者招待"
        subject={organizationSubject(ORGANIZATION_MANAGER_INVITATION_SUBJECT)}
        html={buildOrganizationManagerInvitationEmailHtml({
          recipientName: fixtures.managerName,
          organizationName: fixtures.organizationName,
          inviterName: fixtures.inviterName,
          appUrl: fixtures.appUrl,
          helpUrl: fixtures.helpUrl,
          invitationUrl: fixtures.managerInvitationUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINE: Story = {
  name: "LINE（現在は未送信）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <TextLineNotificationPreview
        label="組織管理者招待・LINE（現在は未送信）"
        text={buildOrganizationManagerInvitationLineText({
          organizationName: fixtures.organizationName,
          invitationUrl: fixtures.managerInvitationUrl,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
