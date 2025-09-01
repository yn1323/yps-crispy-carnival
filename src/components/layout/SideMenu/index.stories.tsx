import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SideMenu } from "./index";

const meta = {
  title: "layout/SideMenu",
  component: SideMenu,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/mypage",
      },
    },
  },
  args: {
    isRegistered: true,
  },
} satisfies Meta<typeof SideMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const Unregistered: Story = {
  args: {
    isRegistered: false,
  },
};
