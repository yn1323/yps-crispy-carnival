import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { PeopleCapacityResolutionAlert } from "./index";

const meta = {
  title: "Shared/PeopleCapacityResolutionAlert",
  component: PeopleCapacityResolutionAlert,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PeopleCapacityResolutionAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChoosePro: Story = {
  args: {
    resolution: { kind: "choosePaidPlan", current: 5, max: 5 },
    retryActionLabel: "スタッフを追加",
    onOpenBillingSettings: () => {},
  },
};

export const ContactForIndividualPlan: Story = {
  args: {
    resolution: { kind: "contact", current: 30, max: 30 },
    retryActionLabel: "申請を承認",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "利用上限について問い合わせる" })).toHaveAttribute(
      "href",
      "/contact",
    );
  },
};

export const ChooseProWithoutBillingNavigation: Story = {
  args: {
    resolution: { kind: "choosePaidPlan", current: 5, max: 5 },
    retryActionLabel: "スタッフを追加",
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "利用上限について問い合わせる" })).toHaveAttribute(
      "href",
      "/contact",
    );
  },
};
