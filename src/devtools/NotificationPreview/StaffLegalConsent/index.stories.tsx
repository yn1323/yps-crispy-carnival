import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildStaffLegalConsentEmailHtml,
  buildStaffLegalConsentLineFlexMessage,
  STAFF_LEGAL_CONSENT_SUBJECT,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  legalDocuments,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/スタッフ法務同意",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="スタッフ法務同意"
        subject={subject(STAFF_LEGAL_CONSENT_SUBJECT)}
        html={buildStaffLegalConsentEmailHtml({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          consentUrl: fixtures.consentUrl,
          expiresAt: fixtures.expiresAt,
          documents: legalDocuments,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINE: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="スタッフ法務同意"
        message={buildStaffLegalConsentLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          consentUrl: fixtures.consentUrl,
          expiresAt: fixtures.expiresAt,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
