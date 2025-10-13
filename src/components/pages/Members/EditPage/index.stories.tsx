import type { Meta, StoryObj } from "@storybook/react-vite";
import { MembersEditPage } from ".";

const meta = {
  title: "Pages/Members/EditPage",
  component: MembersEditPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof MembersEditPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    userId: "user123",
    shopId: "shop123",
  },
};
