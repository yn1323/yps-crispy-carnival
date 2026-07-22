import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrganizationNameDialog } from "./OrganizationNameDialog";

const meta = {
  id: "features-organizationsettings-organizationnamedialog",
  title: "Features/OrganizationSettings/3. ダイアログ/グループ名変更",
  component: OrganizationNameDialog,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    organizationName: "株式会社さくらダイニング",
    isRunning: false,
    onClose: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof OrganizationNameDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "通常" };

export const Mobile: Story = {
  name: "通常・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
