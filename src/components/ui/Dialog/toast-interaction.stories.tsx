import { Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { Toaster, toaster } from "@/src/components/ui/toaster";
import { Dialog, useDialog } from "./index";

const meta = {
  title: "UI/Dialog/ToastInteraction",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const ToastInDialogExample = () => {
  const { isOpen, close, onOpenChange } = useDialog(true);

  return (
    <>
      <Toaster />
      <Dialog title="Snackbar確認" isOpen={isOpen} onOpenChange={onOpenChange} onClose={close} closeLabel="閉じる">
        <Text mb={3}>Dialogの上にSnackbarを表示します。</Text>
        <Button
          colorPalette="teal"
          onClick={() => {
            toaster.create({
              title: "保存しました",
              type: "success",
              duration: Number.POSITIVE_INFINITY,
            });
          }}
        >
          Snackbarを表示
        </Button>
      </Dialog>
    </>
  );
};

export const ToastCloseKeepsDialogOpen: Story = {
  render: () => <ToastInDialogExample />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "Snackbar確認" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Snackbarを表示" }));

    const toastTitle = await screen.findByText("保存しました");
    const toastRoot = toastTitle.closest('[data-scope="toast"][data-part="root"]');
    if (!toastRoot) throw new Error("Toast root was not found");
    const toastCloseButton = toastRoot.querySelector<HTMLButtonElement>('[data-part="close-trigger"]');
    if (!toastCloseButton) throw new Error("Toast close button was not found");

    await userEvent.click(toastCloseButton);
    await expect(screen.getByRole("dialog", { name: "Snackbar確認" })).toBeInTheDocument();
    toaster.dismiss();
  },
};
