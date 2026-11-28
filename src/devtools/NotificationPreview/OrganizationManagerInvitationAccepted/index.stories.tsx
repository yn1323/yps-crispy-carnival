import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildOrganizationBillingEmailHtml,
  buildOrganizationManagerInvitationAcceptedHeading,
  buildOrganizationManagerInvitationAcceptedSubject,
  ORGANIZATION_MANAGER_INVITATION_ACCEPTED_CTA,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewOrganizationSubject as organizationSubject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/組織管理者招待の承認完了",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="組織管理者招待の承認完了"
        subject={organizationSubject(buildOrganizationManagerInvitationAcceptedSubject(fixtures.staffName))}
        html={buildOrganizationBillingEmailHtml({
          recipientName: fixtures.managerName,
          organizationName: fixtures.organizationName,
          heading: buildOrganizationManagerInvitationAcceptedHeading(fixtures.staffName),
          headingSize: "normal",
          paragraphs: [],
          action: { label: ORGANIZATION_MANAGER_INVITATION_ACCEPTED_CTA, url: fixtures.managerSettingsUrl },
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
