import type { Meta, StoryObj } from "@storybook/react-vite";
import { UseCasesSection } from ".";

const meta = {
  title: "Features/LandingPage/UseCasesSection",
  component: UseCasesSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof UseCasesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
