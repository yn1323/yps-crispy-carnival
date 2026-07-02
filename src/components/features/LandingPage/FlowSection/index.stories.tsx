import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowSection } from ".";

const meta = {
  title: "Features/LandingPage/FlowSection",
  component: FlowSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FlowSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
