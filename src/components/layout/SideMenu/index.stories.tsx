import type { Meta, StoryObj } from "@storybook/react-vite";

import { SideMenu } from "./index";

const meta = {
  title: "layout/SideMenu",
  component: SideMenu,
  parameters: {},
} satisfies Meta<typeof SideMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
