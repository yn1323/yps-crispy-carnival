import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { DeleteShopConfirmDialog } from "./DeleteShopConfirmDialog";

const meta = {
  title: "features/auths/AuthenticatedHeader/DeleteShopConfirmDialog",
  component: DeleteShopConfirmDialog,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof DeleteShopConfirmDialog>;

export default meta;
type Story = StoryObj<typeof DeleteShopConfirmDialog>;

const DeleteShopDialogHarness = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>削除確認を開く</Button>
      <DeleteShopConfirmDialog
        shopName="居酒屋さくら"
        isOpen={isOpen}
        onOpenChange={({ open }) => setIsOpen(open)}
        onClose={() => setIsOpen(false)}
        onSubmit={() => {
          setIsSubmitted(true);
          setIsOpen(false);
        }}
      />
      {isSubmitted && <div role="status">店舗削除を確定しました</div>}
    </>
  );
};

export const Behavior: Story = {
  render: () => <DeleteShopDialogHarness />,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "削除確認を開く" }));

    const screen = within(document.body);
    const dialog = await screen.findByRole("alertdialog", { name: "店舗を削除" });
    await waitFor(() => expect(dialog).toBeVisible());
    const dialogScope = within(dialog);
    await waitFor(() =>
      expect(dialogScope.getByText("店舗情報、スタッフ、これまでのシフトをすべて削除します。")).toBeVisible(),
    );
    await waitFor(() => expect(dialogScope.getByText("「居酒屋さくら」を削除してよろしいですか？")).toBeVisible());

    await userEvent.click(dialogScope.getByRole("button", { name: "この店舗を削除" }));
    await waitFor(() => expect(dialog).not.toBeVisible());
    await expect(await screen.findByRole("status")).toHaveTextContent("店舗削除を確定しました");
  },
};
