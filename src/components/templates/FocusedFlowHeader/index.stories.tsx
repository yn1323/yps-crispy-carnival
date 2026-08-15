import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { FocusedFlowHeader } from ".";

const meta = {
  title: "Templates/FocusedFlowHeader",
  component: FocusedFlowHeader,
  args: {
    title: "シフトを調整",
    backLabel: "シフト一覧へ戻る",
    backAriaLabel: "シフト一覧へ戻る",
    action: null,
  },
  render: (args) => <FocusedFlowHeader {...args} action={<Button size="sm">要望を送る</Button>} />,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FocusedFlowHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizationScoped: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "シフトを調整" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "シフト一覧へ戻る" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "要望を送る" })).toBeVisible();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Compact: Story = {
  args: { compact: true },
};
