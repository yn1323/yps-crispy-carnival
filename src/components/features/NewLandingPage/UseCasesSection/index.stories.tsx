import type { Meta, StoryObj } from "@storybook/react-vite";
import { UseCasesSection } from ".";

const meta = {
  title: "Features/NewLandingPage/UseCasesSection",
  component: UseCasesSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof UseCasesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
