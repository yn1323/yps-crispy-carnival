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

export const ChoosePaidPlan: Story = {
  args: {
    resolution: { kind: "choosePaidPlan", current: 5, max: 5 },
    retryActionLabel: "スタッフを追加",
    onOpenBillingSettings: () => {},
  },
};

export const LimitReached: Story = {
  args: {
    resolution: { kind: "limitReached", current: 50, max: 50 },
    retryActionLabel: "申請を承認",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("このプランでは、これ以上利用者を追加できません。", { exact: false })).toBeVisible();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
};

export const ChoosePaidPlanWithoutBillingNavigation: Story = {
  args: {
    resolution: { kind: "choosePaidPlan", current: 5, max: 5 },
    retryActionLabel: "スタッフを追加",
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("このプランでは、これ以上利用者を追加できません。", { exact: false })).toBeVisible();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
};
