import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopManagementDialog } from "./ShopManagementDialog";

const meta = {
  title: "Features/OrganizationSettings/ShopManagementDialog",
  component: ShopManagementDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: { kind: "addShop" },
    onClose: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof ShopManagementDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddShop: Story = {};

export const MobileAddShop: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
