import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProblemSection } from ".";

const meta = {
  title: "Features/LandingPage/ProblemSection",
  component: ProblemSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ProblemSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
