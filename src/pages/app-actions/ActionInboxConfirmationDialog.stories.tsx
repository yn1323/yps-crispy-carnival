import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { ActionInboxConfirmationDialog } from "./ActionInboxConfirmationDialog";
import type { ActionInboxConfirmation } from "./useActionInboxController";

const organizationId = "organization-story" as Id<"organizations">;
const shopId = "shop-story" as Id<"shops">;

const resolveNotificationConfirmation: Exclude<ActionInboxConfirmation, null> = {
  kind: "resolveNotification",
  item: {
    id: "notificationFailure:story",
    kind: "notificationFailure",
    scope: { kind: "shop", organizationId, shopId },
    failureId: "failure-story" as Id<"notificationFailureInbox">,
    shopName: "yn1323店舗",
    staffName: "田中",
    notificationKindLabel: "シフト募集通知",
    channel: "email",
    lastFailedAt: Date.now(),
    canRetry: true,
    canResolve: true,
    occurredAt: Date.now(),
  },
};

const meta = {
  title: "Pages/AppActions/ConfirmationDialog",
  component: ActionInboxConfirmationDialog,
  args: {
    confirmation: resolveNotificationConfirmation,
    errorMessage: null,
    isRunning: false,
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ActionInboxConfirmationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ResolveNotification: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog", { name: "送れなかった通知を再送せず破棄しますか？" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(body.getByRole("button", { name: "再送せず破棄する" }));
    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
};

export const ErrorState: Story = {
  args: { errorMessage: "最新の状態を確認できませんでした。もう一度お試しください。" },
};

export const PendingMobile: Story = {
  tags: ["vrt-mobile2"],
  args: { isRunning: true },
  globals: { viewport: { value: "mobile2", isRotated: false } },
};
