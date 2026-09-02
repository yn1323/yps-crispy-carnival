import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ActionInboxConfirmation, ActionInboxConfirmationDialog } from "./ActionInboxConfirmationDialog";

const resolveNotificationConfirmation: Exclude<ActionInboxConfirmation, null> = {
  kind: "resolveNotification",
  itemId: "notificationFailure:story",
  staffName: "田中",
  notificationKindLabel: "シフト募集通知",
};

const meta = {
  title: "Features/ActionInbox/ConfirmationDialog",
  component: ActionInboxConfirmationDialog,
  args: {
    confirmation: resolveNotificationConfirmation,
    errorMessage: null,
    isRunning: false,
    onClose: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof ActionInboxConfirmationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ResolveNotification: Story = {};

export const ErrorState: Story = {
  args: { errorMessage: "最新の状態を確認できませんでした。もう一度お試しください。" },
};

export const PendingMobile: Story = {
  tags: ["vrt-mobile2"],
  args: { isRunning: true },
  globals: { viewport: { value: "mobile2", isRotated: false } },
};
