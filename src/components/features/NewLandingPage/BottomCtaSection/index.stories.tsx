import type { Meta, StoryObj } from "@storybook/react-vite";
import { BottomCtaSection } from ".";

const meta = {
  title: "Features/NewLandingPage/BottomCtaSection",
  component: BottomCtaSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof BottomCtaSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
