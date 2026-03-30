import type { Meta, StoryObj } from "@storybook/react-vite";
import { FooterInfo } from "./index";

const meta = {
  title: "features/StaffView/FooterInfo",
  component: FooterInfo,
} satisfies Meta<typeof FooterInfo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
