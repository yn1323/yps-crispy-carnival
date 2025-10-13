import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserEdit } from ".";

const meta = {
  title: "Features/User/UserEdit",
  component: UserEdit,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof UserEdit>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    user: {
      _id: "user123" as any,
      _creationTime: Date.now(),
      name: "山田太郎",
      authId: "auth123",
      createdAt: Date.now(),
      isDeleted: false,
    },
    shopId: "shop123",
  },
};
