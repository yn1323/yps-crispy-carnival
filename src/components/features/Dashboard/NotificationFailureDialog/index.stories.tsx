import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { type DashboardNotificationFailure, NotificationFailureDialogContent } from "./index";

const meta = {
  title: "Features/Dashboard/NotificationFailureDialog",
  component: NotificationFailureDialogContent,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof NotificationFailureDialogContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const id = (value: string) => value as unknown as Id<"notificationFailureInbox">;

const failures: DashboardNotificationFailure[] = [
  {
    _id: id("failure-1"),
    staffName: "佐藤 真由美",
    notificationKind: "recruitment",
    notificationKindLabel: "シフト募集通知",
    periodLabel: "7/1〜7/15",
    channel: "email",
    lastFailedAt: new Date("2026-06-22T05:23:00.000Z").getTime(),
    canRetry: true,
  },
  {
    _id: id("failure-2"),
    staffName: "高橋 健太",
    notificationKind: "reminder",
    notificationKindLabel: "催促用リンク",
    periodLabel: "7/1〜7/15",
    channel: "line",
    lastFailedAt: new Date("2026-06-22T04:58:00.000Z").getTime(),
    canRetry: true,
  },
  {
    _id: id("failure-3"),
    staffName: "山本 彩",
    notificationKind: "confirmation",
    notificationKindLabel: "確定シフト",
    periodLabel: "7/1〜7/15",
    channel: "email",
    lastFailedAt: new Date("2026-06-22T03:11:00.000Z").getTime(),
    canRetry: true,
  },
  {
    _id: id("failure-4"),
    staffName: "田中 一郎",
    notificationKind: "lineInvite",
    notificationKindLabel: "LINE連携案内",
    periodLabel: null,
    channel: "email",
    lastFailedAt: new Date("2026-06-22T02:40:00.000Z").getTime(),
    canRetry: true,
  },
];

export const Normal: Story = {
  args: {
    failures,
    acceptedFailureIds: new Set(),
    resendingFailureIds: new Set(),
    isResendingAll: false,
    onResend: () => {},
    onResendAll: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "すべて再通知" })).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "メール通知について" })[0]);
    await expect(await canvas.findByText(/メールが届かない場合は/)).toBeInTheDocument();
  },
};

export const Accepted: Story = {
  args: {
    ...Normal.args,
    acceptedFailureIds: new Set([failures[0]._id]),
  },
};

export const Empty: Story = {
  args: {
    ...Normal.args,
    failures: [],
  },
};

export const Mobile: Story = {
  args: Normal.args,
  decorators: [
    (Story) => (
      <Box maxW="360px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole("button", { name: "メール通知について" })[0]);
    await expect(await canvas.findByText(/メールが届かない場合は/)).toBeInTheDocument();
    await expect(canvas.getAllByText(/エラー日時：/)[0]).toBeInTheDocument();
  },
};

export const Interactive: Story = {
  args: Normal.args,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: () => <InteractiveNotificationFailureDialog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const resendButtons = canvas.getAllByRole("button", { name: /^再通知$/ });
    await userEvent.click(resendButtons[0]);
    const acceptedButtons = await canvas.findAllByRole("button", { name: "再送受付済み" });
    await expect(acceptedButtons[0]).toBeInTheDocument();
  },
};

const InteractiveNotificationFailureDialog = () => {
  const [acceptedFailureIds, setAcceptedFailureIds] = useState<Set<Id<"notificationFailureInbox">>>(new Set());

  return (
    <NotificationFailureDialogContent
      failures={failures}
      acceptedFailureIds={acceptedFailureIds}
      resendingFailureIds={new Set()}
      isResendingAll={false}
      onResend={(failureId) => setAcceptedFailureIds((current) => new Set(current).add(failureId))}
      onResendAll={() => setAcceptedFailureIds(new Set(failures.map((failure) => failure._id)))}
    />
  );
};
