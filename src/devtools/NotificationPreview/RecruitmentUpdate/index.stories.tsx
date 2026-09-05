import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RecruitmentUpdate } from "@/convex/notification/recruitmentUpdate";
import {
  buildRecruitmentEmailHtml,
  buildRecruitmentEmailSubject,
  buildRecruitmentLineFlexMessage,
} from "@/convex/notification/templates";
import {
  EmailNotificationPreview,
  FlexLineNotificationPreview,
  notificationPreviewFixtures as fixtures,
  notificationPreviewLineCtaHtml as lineCtaHtml,
  notificationPreviewLineReCtaHtml as lineReCtaHtml,
  NotificationPreviewStoryFrame,
  notificationPreviewSubject as subject,
} from "../shared";

const meta = {
  title: "devtools/NotificationPreview/募集条件変更",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

const recruitmentUpdate = {
  before: {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-10",
    deadline: "2026-04-24",
    shopClosedDates: ["2026-05-04"],
  },
  after: {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-15",
    deadline: "2026-04-25",
    shopClosedDates: ["2026-05-04", "2026-05-11"],
  },
} satisfies RecruitmentUpdate;

const updateParams = {
  isUpdate: true,
  recruitmentUpdate,
  staffName: fixtures.staffName,
  periodLabel: fixtures.periodLabel,
  deadline: "4/25(土) 23:59",
  shopClosedDates: ["2026-05-04", "2026-05-11"],
  magicLinkUrl: fixtures.submitLinkUrl,
};

const deadlineOnlyParams = {
  ...updateParams,
  recruitmentUpdate: {
    before: { ...recruitmentUpdate.after, deadline: "2026-04-24" },
    after: recruitmentUpdate.after,
  },
};

const closedDaysOnlyParams = {
  ...updateParams,
  recruitmentUpdate: {
    before: { ...recruitmentUpdate.after, shopClosedDates: ["2026-05-04"] },
    after: recruitmentUpdate.after,
  },
};

export const Email: Story = {
  name: "メール（LINE連携）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集条件変更"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel, true))}
        html={buildRecruitmentEmailHtml({ ...updateParams, lineCtaHtml })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const EmailLineRelink: Story = {
  name: "メール（LINE再連携）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集条件変更・LINE再連携"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel, true))}
        html={buildRecruitmentEmailHtml({ ...updateParams, lineCtaHtml: lineReCtaHtml })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const EmailWithoutLineCta: Story = {
  name: "メール（LINE案内なし）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集条件変更・LINE案内なし"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel, true))}
        html={buildRecruitmentEmailHtml(updateParams)}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINE: Story = {
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="募集条件変更"
        message={buildRecruitmentLineFlexMessage({ ...updateParams, shopName: fixtures.shopName })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const EmailDeadlineOnly: Story = {
  name: "メール（提出期限のみ変更）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集条件変更・提出期限のみ"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel, true))}
        html={buildRecruitmentEmailHtml(deadlineOnlyParams)}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINEDeadlineOnly: Story = {
  name: "LINE（提出期限のみ変更）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="募集条件変更・提出期限のみ"
        message={buildRecruitmentLineFlexMessage({ ...deadlineOnlyParams, shopName: fixtures.shopName })}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const EmailClosedDaysOnly: Story = {
  name: "メール（定休日のみ変更）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label="募集条件変更・定休日のみ"
        subject={subject(buildRecruitmentEmailSubject(fixtures.periodLabel, true))}
        html={buildRecruitmentEmailHtml(closedDaysOnlyParams)}
      />
    </NotificationPreviewStoryFrame>
  ),
};

export const LINEClosedDaysOnly: Story = {
  name: "LINE（定休日のみ変更）",
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label="募集条件変更・定休日のみ"
        message={buildRecruitmentLineFlexMessage({ ...closedDaysOnlyParams, shopName: fixtures.shopName })}
      />
    </NotificationPreviewStoryFrame>
  ),
};
