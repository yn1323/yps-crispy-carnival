import type { Meta, StoryObj } from "@storybook/nextjs";

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
} satisfies Meta<typeof SideMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
