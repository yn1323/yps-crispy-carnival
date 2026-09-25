import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { FeaturesPage } from ".";

const meta = {
  title: "Pages/FeaturesPage",
  component: FeaturesPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FeaturesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const groupHeadings = canvas.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

    // TOPの「毎月やることは3つだけ」と同じ3ステップで分け、店舗管理は流れの外に置く。
    await expect(groupHeadings.slice(0, 4)).toEqual([
      "シフトを募集する",
      "シフトを組む",
      "シフトを確定する",
      "店舗とスタッフの管理",
    ]);
    await expect(canvas.queryByText("STEP 4")).not.toBeInTheDocument();
    for (const [name, href] of [
      ["希望シフトの回収", "/features/shift-request-collection"],
      ["提出状況の確認と自動催促", "/features/submission-reminder"],
      ["シフト表の作成", "/features/shift-schedule"],
      ["確定シフトの共有", "/features/shift-sharing"],
      ["複数店舗・スタッフ管理", "/features/multi-store"],
    ]) {
      await expect(canvas.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    const capabilities = within(canvas.getByRole("list", { name: "シフト表の作成でできること" }));
    await expect(capabilities.getByText("PDF・Excelに出力できる")).toBeInTheDocument();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};
