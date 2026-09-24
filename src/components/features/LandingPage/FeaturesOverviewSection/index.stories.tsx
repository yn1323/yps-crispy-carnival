import type { Meta, StoryObj } from "@storybook/react-vite";
import { FeaturesOverviewSection } from ".";

const meta = {
  title: "Features/LandingPage/FeaturesOverviewSection",
  component: FeaturesOverviewSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FeaturesOverviewSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
