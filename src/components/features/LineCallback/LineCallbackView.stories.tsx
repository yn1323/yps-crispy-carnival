import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineCallbackView } from "./LineCallbackView";

const meta = {
  title: "Features/Line/LineCallbackPage",
  component: LineCallbackView,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LineCallbackView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { status: "loading" },
};

export const Ok: Story = {
  args: { status: "ok" },
};

export const NeedsFollow: Story = {
  args: { status: "needs_follow" },
};

export const Expired: Story = {
  args: { status: "expired" },
};

export const RateLimited: Story = {
  args: { status: "rate_limited" },
};

export const ErrorState: Story = {
  args: { status: "error" },
};
