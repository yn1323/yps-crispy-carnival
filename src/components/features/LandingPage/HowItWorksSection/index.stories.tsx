import type { Meta, StoryObj } from "@storybook/react-vite";
import { HowItWorksSection } from ".";

const meta = {
  title: "Features/LandingPage/HowItWorksSection",
  component: HowItWorksSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HowItWorksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
