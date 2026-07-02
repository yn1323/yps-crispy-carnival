import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComparisonSection } from ".";

const meta = {
  title: "Features/NewLandingPage/ComparisonSection",
  component: ComparisonSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ComparisonSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
