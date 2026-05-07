import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingPageMock } from ".";

const meta = {
  title: "Mock/LandingPage",
  component: LandingPageMock,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LandingPageMock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
