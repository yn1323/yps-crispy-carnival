import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { HelpShiftManagementScenario } from "./HelpShiftManagementScenario";

const meta = {
  title: "Features/HelpCenter/Scenario",
  component: HelpShiftManagementScenario,
  decorators: [
    (Story) => (
      <>
        <style>{`
          html[data-vrt="true"] header {
            position: static !important;
            inset-inline-start: auto !important;
            inset-inline-end: auto !important;
            top: auto !important;
          }

          html[data-vrt="true"] main {
            padding-top: 0 !important;
          }
        `}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HelpShiftManagementScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("heading", { level: 1, name: "毎回のシフト管理を進める" })).toBeVisible();
    await expect(canvas.getByText("シフトリの基本的な使い方を紹介します。")).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 2, name: "シフト回収の流れ" })).toBeVisible();
    await expect(canvas.getByRole("navigation", { name: "シフト回収の流れ" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "1 募集開始" })).toHaveAttribute("href", "#create-recruitment");
    await expect(canvas.getByRole("link", { name: "4 スタッフへ通知" })).toHaveAttribute("href", "#check-notification");
    await expect(canvas.getByRole("link", { name: "スタッフの追加方法を見る" })).toHaveAttribute(
      "href",
      "/help/tasks/staff-management#add-staff-methods",
    );
    await expect(canvas.getByRole("heading", { level: 2, name: "募集シフトを作成する" })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 2, name: "希望シフトを提出する" })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 2, name: "確定したシフトを通知する" })).toBeVisible();
    await expect(canvas.getAllByText("管理者")).toHaveLength(3);
    await expect(canvas.getAllByText("スタッフ")).toHaveLength(2);
    await expect(canvas.getAllByText("動画は準備中")).toHaveLength(4);
    await expect(canvas.getByTitle("シフト確定メールの表示例")).toHaveAttribute("sandbox", "");
    await expect(canvas.queryByText("各ステップを選択すると、ページ内の説明へ移動します。")).not.toBeInTheDocument();
    await expect(canvas.queryByText(/^完了：/)).not.toBeInTheDocument();
    await expect(canvas.queryByText("メールの例")).not.toBeInTheDocument();
    await expect(canvas.queryByText("勤務日と時間はスタッフごとに異なります。")).not.toBeInTheDocument();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("navigation", { name: "シフト回収の流れ", hidden: true })).not.toBeVisible();
  },
};
