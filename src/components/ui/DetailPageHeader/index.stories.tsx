import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DetailPageHeader } from ".";

const meta = {
  title: "UI/DetailPageHeader",
  component: DetailPageHeader,
  parameters: { layout: "padded" },
  args: {
    title: "店舗詳細",
    onBack: fn(),
  },
} satisfies Meta<typeof DetailPageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const backButton = within(canvasElement).getByRole("button", { name: "店舗詳細" });
    await expect(backButton).toHaveAccessibleDescription("前の画面に戻る");
    await userEvent.click(backButton);
    await expect(args.onBack).toHaveBeenCalledOnce();
  },
};

export const LongTitle: Story = {
  args: {
    title: "とても長い名称を持つ店舗の詳細情報",
  },
};
