import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpiredView } from "./index";

const meta = {
  title: "features/StaffView/ExpiredView",
  component: ExpiredView,
} satisfies Meta<typeof ExpiredView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithReissueLink: Story = {
  args: {
    recruitmentId: "abc123",
  },
};

export const WithoutReissueLink: Story = {
  args: {
    recruitmentId: null,
  },
};
