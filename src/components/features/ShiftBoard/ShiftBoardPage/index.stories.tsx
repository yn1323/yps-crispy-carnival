import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftBoardPage } from "./index";

const meta = {
  title: "Features/ShiftBoard/ShiftBoardPage",
  component: ShiftBoardPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftBoardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {};

export const SP: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
