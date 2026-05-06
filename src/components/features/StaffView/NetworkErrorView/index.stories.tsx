import type { Meta, StoryObj } from "@storybook/react-vite";
import { NetworkErrorView } from "./index";

const meta = {
  title: "Features/StaffView/NetworkErrorView",
  component: NetworkErrorView,
} satisfies Meta<typeof NetworkErrorView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onRetry: () => {},
  },
};
