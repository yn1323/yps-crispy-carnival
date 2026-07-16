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

export const UpgradeToBusiness: Story = {
  args: {
    resolution: { kind: "upgradeToBusiness", current: 15, max: 15 },
    retryActionLabel: "スタッフを追加",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "プランと支払いを確認" })).toHaveAttribute(
      "href",
      "/settings?tab=billing",
    );
  },
};

export const CancelScheduledProChange: Story = {
  args: {
    resolution: { kind: "cancelScheduledProChange" },
    retryActionLabel: "管理者を招待",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "プラン変更予定を確認" })).toHaveAttribute(
      "href",
      "/settings?tab=billing",
    );
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
