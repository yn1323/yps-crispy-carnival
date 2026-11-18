import type { Meta, StoryObj } from "@storybook/react-vite";
import { MINUTE_MS, STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS } from "@/convex/constants";
import {
  buildStaffRegistrationVerificationCodeEmailHtml,
  buildStaffRegistrationVerificationCodeSubject,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  notificationPreviewFixtures as fixtures,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/スタッフ登録の確認コード",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

const PREVIEW_CODE = "048213";

export const Email: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="スタッフ登録の確認コード"
        subject={subject(buildStaffRegistrationVerificationCodeSubject(PREVIEW_CODE))}
        html={buildStaffRegistrationVerificationCodeEmailHtml({
          shopName: fixtures.shopName,
          code: PREVIEW_CODE,
          expiresInMinutes: STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS / MINUTE_MS,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
