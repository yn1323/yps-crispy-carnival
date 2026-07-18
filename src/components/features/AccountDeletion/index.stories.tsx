import { Box, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { AccountDeletionDialog } from "./AccountDeletionDialog";
import { AccountDeletionTrigger, type AccountDeletionVariant } from "./AccountDeletionTrigger";
import type { AccountDeletionErrorState } from "./types";

type PreviewProps = {
  variant: AccountDeletionVariant;
  initialOpen?: boolean;
  isRunning?: boolean;
  error?: AccountDeletionErrorState | null;
  showTrigger?: boolean;
  countSubmissions?: boolean;
};

function AccountDeletionPreview({
  variant,
  initialOpen = false,
  isRunning = false,
  error = null,
  showTrigger = true,
  countSubmissions = false,
}: PreviewProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [submissionCount, setSubmissionCount] = useState(0);
  const { run, isRunning: isSubmitting } = useSingleFlight(async () => {
    if (countSubmissions) setSubmissionCount((current) => current + 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  const effectiveRunning = isRunning || isSubmitting;
  const close = () => {
    if (!effectiveRunning) setIsOpen(false);
  };

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      {showTrigger ? <AccountDeletionTrigger variant={variant} onOpen={() => setIsOpen(true)} /> : null}
      {countSubmissions ? <Text data-testid="submission-count">送信回数: {submissionCount}</Text> : null}
      <AccountDeletionDialog
        isOpen={isOpen}
        isRunning={effectiveRunning}
        error={error}
        onClose={close}
        onOpenChange={({ open }) => {
          if (open) setIsOpen(true);
          else close();
        }}
        onSubmit={() => {
          void run();
        }}
      />
    </Box>
  );
}

const meta = {
  title: "Features/AccountDeletion",
  component: AccountDeletionPreview,
  parameters: { layout: "fullscreen" },
  args: {
    variant: "setup",
  },
} satisfies Meta<typeof AccountDeletionPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SetupTrigger: Story = {};

export const SetupTriggerMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const LegacyTrigger: Story = {
  args: { variant: "legacy" },
};

export const DialogReady: Story = {
  args: { initialOpen: true, showTrigger: false },
};

export const DialogRunning: Story = {
  args: { initialOpen: true, isRunning: true, showTrigger: false },
};

export const DialogError: Story = {
  args: {
    initialOpen: true,
    showTrigger: false,
    error: {
      message: "所属情報が更新されたため削除できません。画面を更新してご確認ください。",
      showContactLink: false,
    },
  },
};

export const DialogGeneralError: Story = {
  args: {
    initialOpen: true,
    showTrigger: false,
    error: {
      message: "アカウントの削除を受け付けられませんでした。時間をおいてもう一度お試しください。",
      showContactLink: true,
    },
  },
};

export const GeneralErrorContactBehavior: Story = {
  args: DialogGeneralError.args,
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });
    await expect(within(dialog).getByRole("link", { name: "お問い合わせへ" })).toHaveAttribute("href", "/contact");
  },
};

export const DialogMobile: Story = {
  args: { initialOpen: true, showTrigger: false },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const OpenAndCancelBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "アカウントを削除" }));
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("alertdialog", { name: "アカウントを削除" })).not.toBeInTheDocument());
  },
};

export const DoubleSubmitBehavior: Story = {
  args: { initialOpen: true, showTrigger: false, countSubmissions: true },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });
    const submit = within(dialog).getByRole("button", { name: "アカウントを削除" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(body.getByTestId("submission-count")).toHaveTextContent("送信回数: 1"));
  },
};

export const RunningCloseLockBehavior: Story = {
  args: { initialOpen: true, isRunning: true, showTrigger: false },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });

    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    await expect(body.getByRole("alertdialog", { name: "アカウントを削除" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await expect(body.getByRole("alertdialog", { name: "アカウントを削除" })).toBeInTheDocument();
  },
};
