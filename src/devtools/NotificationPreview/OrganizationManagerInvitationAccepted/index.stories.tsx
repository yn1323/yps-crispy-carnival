import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildOrganizationBillingEmailHtml } from "@/convex/notification/templates";
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

const acceptedHeading = "管理者のアカウント連携が完了しました";

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="組織管理者招待の承認完了"
        subject={organizationSubject(acceptedHeading)}
        html={buildOrganizationBillingEmailHtml({
          recipientName: fixtures.managerName,
          organizationName: fixtures.organizationName,
          heading: acceptedHeading,
          paragraphs: ["新しい管理者のアカウントが組織に連携されました。"],
          action: { label: "管理者設定を確認する", url: fixtures.managerSettingsUrl },
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
