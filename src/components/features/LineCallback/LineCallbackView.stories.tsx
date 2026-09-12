import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { LineCallbackView } from "./LineCallbackView";

const meta = {
  title: "Features/Line/LineCallbackPage",
  component: LineCallbackView,
  parameters: { layout: "fullscreen" },
  args: { officialAccountUrl: "https://lin.ee/shiftori-test" },
} satisfies Meta<typeof LineCallbackView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { status: "loading" },
};

export const Ok: Story = {
  args: { status: "ok" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("link", { name: "公式アカウントを開く" })).not.toBeInTheDocument();
  },
};

export const NeedsFollow: Story = {
  args: { status: "needs_follow" },
  play: async ({ canvasElement, args }) => {
    const link = await within(canvasElement).findByRole("link", { name: "公式アカウントを開く" });
    await expect(link).toHaveAttribute("href", args.officialAccountUrl);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  },
};

export const NeedsFollowMobile: Story = {
  ...NeedsFollow,
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const NeedsFollowWithoutUrl: Story = {
  args: { status: "needs_follow", officialAccountUrl: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("link")).not.toBeInTheDocument();
  },
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
