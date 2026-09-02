import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildOrganizationBillingEmailHtml,
  ORGANIZATION_MANAGER_INVITATION_ACCEPTED_CTA,
  ORGANIZATION_MANAGER_INVITATION_ACCEPTED_HEADING,
  ORGANIZATION_MANAGER_INVITATION_ACCEPTED_SUBJECT,
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
        subject={organizationSubject(ORGANIZATION_MANAGER_INVITATION_ACCEPTED_SUBJECT)}
        html={buildOrganizationBillingEmailHtml({
          recipientName: fixtures.managerName,
          organizationName: fixtures.organizationName,
          heading: ORGANIZATION_MANAGER_INVITATION_ACCEPTED_HEADING,
          headingSize: "normal",
          paragraphs: [],
          action: { label: ORGANIZATION_MANAGER_INVITATION_ACCEPTED_CTA, url: fixtures.managerSettingsUrl },
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
