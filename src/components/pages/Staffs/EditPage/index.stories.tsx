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
    userId: "user123",
    shopId: "shop123",
  },
};
