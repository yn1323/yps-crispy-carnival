import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffEditPage } from ".";

const meta = {
  title: "Pages/Staffs/EditPage",
  component: StaffEditPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof StaffEditPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    userId: "jd7abc123def456ghi789jkl012mno34",
    shopId: "jd7esxeq46sxn5ya9h7q4naaex7s9bkd",
  },
};
