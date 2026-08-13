import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { CommercialTransactions } from ".";

const meta = {
  title: "Features/CommercialTransactions",
  component: CommercialTransactions,
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof CommercialTransactions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "特定商取引法に基づく表記" })).toBeVisible();
    await expect(canvas.getByText("役務提供事業者")).toBeVisible();
    await expect(canvas.getByText("販売価格")).toBeVisible();
    await expect(canvas.getByText("Pro：", { exact: false })).toHaveTextContent("手動入力：Proの月額料金と税込・税別");
    await expect(canvas.getByText("動作環境")).toBeVisible();
    const salesPriceRow = canvas.getByText("販売価格").parentElement as HTMLElement;
    await expect(within(salesPriceRow).getByRole("link", { name: "料金・プラン" })).toHaveAttribute("href", "/pricing");
  },
};

export const SP: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
