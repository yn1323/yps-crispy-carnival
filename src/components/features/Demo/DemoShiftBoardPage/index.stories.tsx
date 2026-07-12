import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { DemoShiftBoardPage } from "./index";

const meta = {
  title: "Features/Demo/DemoShiftBoardPage",
  component: DemoShiftBoardPage,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    // VRT 安定化のため固定日付を差し込む（実機では省略して「来週の月曜」起点）
    baseDate: "2026-05-04",
  },
} satisfies Meta<typeof DemoShiftBoardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { name: "勤務時間入力デモ" })).toBeInTheDocument();
    await expect(await canvas.findByRole("note")).toHaveTextContent(
      "このページはデモ画面です。変更が反映されたり、シフトが送信されることはありません。",
    );
    await expect(await canvas.findByRole("button", { name: "操作デモを開始" })).toBeInTheDocument();
  },
};
