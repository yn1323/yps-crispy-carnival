import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { TrialEndingCalloutView } from "./index";

const meta = {
  title: "Features/Dashboard/TrialEndingCallout",
  component: TrialEndingCalloutView,
  args: {
    finalDateLabel: "8月31日",
    shopId: "shop-trial-ending",
    isBillingVisible: true,
  },
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof TrialEndingCalloutView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const BillingHidden: Story = {
  args: {
    isBillingVisible: false,
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("link", { name: "プランと支払いを見る" })).toBeNull();
    await expect(within(canvasElement).queryByRole("status")).toBeNull();
  },
};
