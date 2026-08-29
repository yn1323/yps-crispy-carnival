import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildOrganizationBillingEmailHtml } from "@/convex/notification/templates";
import { organizationBillingEmailChangedNotificationCopy } from "@/convex/organizationBilling/notification";
import {
  EmailNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewOrganizationSubject as organizationSubject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/組織の契約・請求",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BillingEmailChanged: Story = {
  name: "請求先メールアドレス変更",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="請求先メールアドレス変更"
        subject={organizationSubject(organizationBillingEmailChangedNotificationCopy.subject)}
        html={buildOrganizationBillingEmailHtml({
          recipientName: fixtures.managerName,
          organizationName: fixtures.organizationName,
          heading: organizationBillingEmailChangedNotificationCopy.heading,
          paragraphs: organizationBillingEmailChangedNotificationCopy.paragraphs,
          action: { label: "シフトリを確認する", url: fixtures.billingSettingsUrl },
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
