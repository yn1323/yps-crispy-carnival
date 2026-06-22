import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
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
    assertText(canvasElement, "エラー日時：", "SPカードのエラー日時ラベル");
  },
};

export const Interactive: Story = {
  args: Normal.args,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: () => <InteractiveNotificationFailureDialog />,
  play: async ({ canvasElement }) => {
    const resendButton = findButtonByText(canvasElement, "再通知");
    resendButton.click();
    await waitUntil(
      () => canvasElement.textContent?.includes("再通知済み") ?? false,
      "再通知済みボタンが表示されませんでした",
    );
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

function findButtonByText(root: Element, text: string) {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`button "${text}" が見つかりませんでした`);
  }
  return button;
}

function assertText(root: Element, text: string, label: string) {
  if (!root.textContent?.includes(text)) {
    throw new Error(`${label}: "${text}" が見つかりませんでした`);
  }
}

async function waitUntil(predicate: () => boolean, failureMessage: string) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 2000) {
    if (predicate()) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error(failureMessage);
}
