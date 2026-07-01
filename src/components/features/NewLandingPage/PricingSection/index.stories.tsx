import type { Meta, StoryObj } from "@storybook/react-vite";
import { PricingSection } from ".";

const meta = {
  title: "Features/NewLandingPage/PricingSection",
  component: PricingSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PricingSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
