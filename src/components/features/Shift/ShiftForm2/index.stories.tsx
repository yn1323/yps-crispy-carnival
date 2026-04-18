import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm2 } from ".";

const meta = {
  title: "Features/Shift/ShiftForm2",
  component: ShiftForm2,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftForm2>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListPC: Story = {
  args: { initialView: "list", period: "1m" },
};

export const ListPCWeek: Story = {
  args: { initialView: "list", period: "1w" },
};

export const DailyPC: Story = {
  args: { initialView: "daily", period: "1m" },
};

export const ListSP: Story = {
  args: { initialView: "list", period: "1m" },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const DailySP: Story = {
  args: { initialView: "daily", period: "1m" },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
