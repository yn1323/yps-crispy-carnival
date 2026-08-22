import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { TrialEndingCalloutView } from "./index";

const meta = {
  title: "Features/Dashboard/TrialEndingCallout",
  component: TrialEndingCalloutView,
  args: {
    finalDateLabel: "8月31日",
    onOpenBillingSettings: () => {},
  },
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof TrialEndingCalloutView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("未契約のまま終了すると利用停止になりますが、組織のデータは削除されません。"),
    ).toBeVisible();
    await expect(canvas.getByText("継続して利用するには、ProまたはBusinessを選択してください。")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "プランと支払いを見る" })).toBeVisible();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
