import type { Meta, StoryObj } from "@storybook/react-vite";
import { DemoShiftBoardPage } from "./index";

const meta = {
  title: "Features/ShiftBoard/DemoShiftBoardPage",
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

export const PC: Story = {};
