import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopManagementDialog } from "./ShopManagementDialog";

const meta = {
  id: "features-organizationsettings-shopmanagementdialog",
  title: "Features/OrganizationSettings/3. ダイアログ/店舗追加",
  component: ShopManagementDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: { kind: "addShop" },
    isRunning: false,
    onClose: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof ShopManagementDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddShop: Story = { name: "通常" };

export const MobileAddShop: Story = {
  name: "通常・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
