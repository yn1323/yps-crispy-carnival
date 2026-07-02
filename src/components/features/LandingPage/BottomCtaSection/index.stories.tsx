import type { Meta, StoryObj } from "@storybook/react-vite";
import { BottomCtaSection } from ".";

const meta = {
  title: "Features/LandingPage/BottomCtaSection",
  component: BottomCtaSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof BottomCtaSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
