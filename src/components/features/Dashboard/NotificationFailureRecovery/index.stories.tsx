import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import type { DashboardNotificationFailure } from "../NotificationFailureDialog";
import { NotificationFailureRecoveryView } from "./NotificationFailureRecoveryView";

const id = (value: string) => value as unknown as Id<"notificationFailureInbox">;

const failure: DashboardNotificationFailure = {
  _id: id("failure-dismiss"),
  staffName: "佐藤 真由美",
  notificationKind: "recruitment",
  notificationKindLabel: "シフト募集通知",
  periodLabel: "7/1〜7/15",
  channel: "email",
  lastFailedAt: new Date("2026-06-22T05:23:00.000Z").getTime(),
  canRetry: true,
};

const meta = {
  title: "Features/Dashboard/NotificationFailureRecovery",
  component: NotificationFailureRecoveryView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: true,
    onOpenChange: () => {},
    onClose: () => {},
    failures: [failure],
    acceptedFailureIds: new Set(),
    resendingFailureIds: new Set(),
    isResendingAll: false,
    dismissTarget: null,
    isDismissing: false,
    onResend: () => {},
    onResendAll: () => {},
    onDismiss: () => {},
    onCancelDismiss: () => {},
    onConfirmDismiss: () => {},
  },
} satisfies Meta<typeof NotificationFailureRecoveryView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DismissConfirmation: Story = {
  args: {
    dismissTarget: failure,
  },
};

export const DismissBehavior: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <InteractiveDismissStory />,
  play: async () => {
    const body = within(document.body);
    const failureDialog = await body.findByRole("dialog", { name: "送れなかった通知" });
    const row = within(failureDialog).getByRole("row", { name: /佐藤 真由美/ });

    await userEvent.click(within(row).getByRole("button", { name: "無視する" }));

    const confirmation = await body.findByRole("alertdialog", {
      name: "送れなかった通知を無視する",
    });
    const description = within(confirmation).getByText("無視すると一覧から削除され、再送されません。");
    await waitFor(() => expect(description).toBeVisible());
    await userEvent.click(within(confirmation).getByRole("button", { name: "無視する" }));

    await waitFor(() =>
      expect(within(failureDialog).queryByRole("row", { name: /佐藤 真由美/ })).not.toBeInTheDocument(),
    );
  },
};

function InteractiveDismissStory() {
  const [failures, setFailures] = useState([failure]);
  const [dismissTarget, setDismissTarget] = useState<DashboardNotificationFailure | null>(null);

  return (
    <NotificationFailureRecoveryView
      {...meta.args}
      failures={failures}
      dismissTarget={dismissTarget}
      onDismiss={setDismissTarget}
      onCancelDismiss={() => setDismissTarget(null)}
      onConfirmDismiss={() => {
        if (!dismissTarget) return;
        setFailures((current) => current.filter((item) => item._id !== dismissTarget._id));
        setDismissTarget(null);
      }}
    />
  );
}
