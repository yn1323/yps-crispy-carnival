import type { Meta, StoryObj } from "@storybook/react-vite";
import { HeroSection } from ".";

const meta = {
  title: "Features/NewLandingPage/HeroSection",
  component: HeroSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof HeroSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
