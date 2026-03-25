import type { Meta, StoryObj } from "@storybook/react-vite";
import { SideMenu } from "./index";

const meta = {
  title: "templates/SideMenu",
  component: SideMenu,
} satisfies Meta<typeof SideMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
