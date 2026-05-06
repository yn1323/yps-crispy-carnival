import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineInviteConfirmContent } from ".";

const meta = {
  title: "Features/Line/LineInviteConfirmContent",
  component: LineInviteConfirmContent,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LineInviteConfirmContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    staffName: "田中太郎",
    staffEmail: "tanaka@example.com",
  },
};
