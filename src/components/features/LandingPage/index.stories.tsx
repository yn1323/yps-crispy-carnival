import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingPage } from ".";

const meta = {
  title: "Features/LandingPage",
  component: LandingPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
