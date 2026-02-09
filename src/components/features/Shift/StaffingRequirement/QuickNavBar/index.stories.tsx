import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuickNavBar } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/QuickNavBar",
  component: QuickNavBar,
  parameters: {
    layout: "padded",
    viewport: { defaultViewport: "mobile1" },
  },
} satisfies Meta<typeof QuickNavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const periods = [
  { label: "朝", id: "period-朝" },
  { label: "ランチ", id: "period-ランチ" },
  { label: "午後", id: "period-午後" },
  { label: "ディナー", id: "period-ディナー" },
  { label: "夜", id: "period-夜" },
];

export const Basic: Story = {
  args: {
    periods,
  },
};

export const WithActive: Story = {
  args: {
    periods,
    activePeriod: "period-ランチ",
  },
};
