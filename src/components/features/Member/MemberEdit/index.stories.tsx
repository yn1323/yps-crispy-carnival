import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemberEdit } from ".";

const meta = {
  title: "Features/Member/MemberEdit",
  component: MemberEdit,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof MemberEdit>;

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
