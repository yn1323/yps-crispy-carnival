import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffHeader } from "./index";

const meta = {
  title: "templates/StaffHeader",
  component: StaffHeader,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof StaffHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shopName: "居酒屋さくら",
  },
};
