import type { Meta, StoryObj } from "@storybook/react-vite";
import { Terms } from ".";

const meta = {
  title: "Features/Terms",
  component: Terms,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Terms>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {};

export const SP: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
