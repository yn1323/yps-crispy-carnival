import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AccountEmailChangeView } from "./AccountEmailChangeView";
import type { AccountEmailChangeController, AccountEmailChangeStep } from "./useAccountEmailChangeController";

const createController = (
  step: AccountEmailChangeStep,
  overrides: Partial<AccountEmailChangeController> = {},
): AccountEmailChangeController => ({
  step,
  currentEmail: "old-login@example.com",
  targetMaskedEmail: "ne***@example.com",
  needsVerificationCode: true,
  updatingLabel: "メールアドレスを更新しています",
  errorMessage: null,
  infoMessage: null,
  isBusy: false,
  start: async () => true,
  verify: async () => true,
  resendCode: async () => true,
  retrySync: async () => true,
  retryCleanup: async () => true,
  rollback: async () => true,
  retryRollbackSync: async () => true,
  retryRollbackCleanup: async () => true,
  backToInput: fn(),
  reset: fn(),
  ...overrides,
});

const meta = {
  title: "Features/AccountEmailChange",
  component: AccountEmailChangeView,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    controller: createController("input"),
    onClose: fn(),
    onFinish: fn(),
  },
} satisfies Meta<typeof AccountEmailChangeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewEmailInput: Story = {
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog", { name: "メールアドレスを変更" }));
    await expect(dialog.getByText("old-login@example.com")).toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "確認コードを送信" })).toBeInTheDocument();
  },
};

export const VerificationCode: Story = {
  args: { controller: createController("verify") },
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog", { name: "メールアドレスを変更" }));
    await expect(dialog.getByRole("textbox", { name: "確認コード" })).toBeInTheDocument();
    await expect(dialog.getByText(/ne\*\*\*@example\.com/)).toBeInTheDocument();
  },
};

export const VerificationCodeMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { controller: createController("verify") },
};

export const Updating: Story = {
  args: { controller: createController("updating", { isBusy: true }) },
  play: async () => {
    await expect(await within(document.body).findByText("メールアドレスを更新しています")).toBeInTheDocument();
  },
};

export const SyncFailed: Story = {
  args: {
    controller: createController("syncFailed", {
      errorMessage: "ログインメールは変更済みですが、シフトリ内の同期が完了していません。",
      retrySync: fn(async () => true),
      rollback: fn(async () => true),
    }),
  },
  play: async ({ args }) => {
    const dialog = within(await within(document.body).findByRole("dialog", { name: "メールアドレスを変更" }));
    await userEvent.click(dialog.getByRole("button", { name: "同期を再試行" }));
    await expect(args.controller.retrySync).toHaveBeenCalledOnce();
    await expect(dialog.getByRole("button", { name: "以前のメールへ戻す" })).toBeInTheDocument();
  },
};

export const OldEmailCleanupFailed: Story = {
  args: { controller: createController("cleanupFailed") },
};

export const RollbackSyncFailed: Story = {
  args: { controller: createController("rollbackSyncFailed") },
};

export const Completed: Story = {
  args: { controller: createController("complete") },
  play: async () => {
    await expect(
      await within(document.body).findByText("次回から、新しいメールアドレスで通常ログインできます。"),
    ).toBeInTheDocument();
  },
};
