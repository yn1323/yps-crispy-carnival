import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReliefSection } from ".";

const meta = {
  title: "Features/NewLandingPage/ReliefSection",
  component: ReliefSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ReliefSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
