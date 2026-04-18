import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingPage3 } from ".";

const meta = {
  title: "Features/LandingPage3",
  component: LandingPage3,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LandingPage3>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {};

export const SP: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
