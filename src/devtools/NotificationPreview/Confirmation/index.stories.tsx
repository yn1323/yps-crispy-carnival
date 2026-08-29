import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildConfirmationEmailHtml, buildShiftConfirmationLineFlexMessage } from "@/convex/notification/templates";
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
  title: "devtools/NotificationPreview/シフト確定",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

type Shifts = Parameters<typeof buildConfirmationEmailHtml>[0]["shifts"];

const emailStory = (name: string, label: string, shifts: Shifts, ctaHtml?: string): Story => ({
  name,
  render: () => (
    <NotificationPreviewStoryFrame>
      <EmailNotificationPreview
        label={label}
        subject={subject(`${fixtures.periodLabel} シフト確定のお知らせ`)}
        html={buildConfirmationEmailHtml({
          staffName: fixtures.staffName,
          periodLabel: fixtures.periodLabel,
          shifts,
          magicLinkUrl: fixtures.magicLinkUrl,
          reissueUrl: fixtures.reissueUrl,
          isResend: false,
          lineCtaHtml: ctaHtml,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
});

const lineStory = (name: string, label: string, shifts: Shifts): Story => ({
  name,
  render: () => (
    <NotificationPreviewStoryFrame>
      <FlexLineNotificationPreview
        label={label}
        message={buildShiftConfirmationLineFlexMessage({
          staffName: fixtures.staffName,
          shopName: fixtures.shopName,
          periodLabel: fixtures.periodLabel,
          shifts,
          magicLinkUrl: fixtures.magicLinkUrl,
          isResend: false,
        })}
      />
    </NotificationPreviewStoryFrame>
  ),
});

export const Email = emailStory("メール（LINE連携）", "シフト確定", fixtures.shifts, lineCtaHtml);

export const EmailLineRelink = emailStory(
  "メール（LINE再連携）",
  "シフト確定・LINE再連携",
  fixtures.shifts,
  lineReCtaHtml,
);

export const EmailWithoutLineCta = emailStory("メール（LINE案内なし）", "シフト確定・LINE案内なし", fixtures.shifts);

export const EmailClosedDay = emailStory(
  "メール（定休日あり）",
  "シフト確定・定休日あり",
  fixtures.shiftsWithClosedDay,
  lineCtaHtml,
);

export const EmailDayBasedShift = emailStory(
  "メール（日ごと・出勤）",
  "シフト確定・日ごと・出勤",
  fixtures.shiftsByDay,
  lineCtaHtml,
);

export const EmailWorkOptionShift = emailStory(
  "メール（勤務パターン）",
  "シフト確定・勤務パターン",
  fixtures.shiftsByWorkOption,
  lineCtaHtml,
);

export const LINE = lineStory("LINE", "シフト確定", fixtures.shifts);

export const LINEClosedDay = lineStory("LINE（定休日あり）", "シフト確定・定休日あり", fixtures.shiftsWithClosedDay);

export const LINEDayBasedShift = lineStory("LINE（日ごと・出勤）", "シフト確定・日ごと・出勤", fixtures.shiftsByDay);

export const LINEWorkOptionShift = lineStory(
  "LINE（勤務パターン）",
  "シフト確定・勤務パターン",
  fixtures.shiftsByWorkOption,
);
