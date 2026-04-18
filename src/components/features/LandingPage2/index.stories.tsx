import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingPage2 } from ".";

const meta = {
  title: "Features/LandingPage2",
  component: LandingPage2,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LandingPage2>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {};

export const SP: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
