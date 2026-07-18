import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ShopManagementDialog } from "./ShopManagementDialog";

const onSubmit = fn();

const meta = {
  title: "Features/OrganizationSettings/ShopManagementDialog",
  component: ShopManagementDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: {
      kind: "shopDetails",
      shop: {
        id: "shop-shibuya",
        name: "渋谷店",
        staffCount: 8,
        canDelete: true,
      },
    },
    isRunning: false,
    onClose: fn(),
    onSubmit,
  },
} satisfies Meta<typeof ShopManagementDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = {};

export const DeleteConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await screen.findByRole("tab", { name: "設定" }));
    await userEvent.click(screen.getByRole("button", { name: "この店舗を削除" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "店舗を削除" });
    await expect(within(confirmation).getByText("「渋谷店」を削除しますか？")).toBeInTheDocument();
    const confirmButton = within(confirmation).getByRole("button", { name: "店舗を削除" });
    await expect(confirmButton).toHaveFocus();
    await userEvent.click(confirmButton);
    await expect(onSubmit).toHaveBeenCalledWith({ kind: "deleteShop", shopId: "shop-shibuya" });
  },
};

export const MobileDetails: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
