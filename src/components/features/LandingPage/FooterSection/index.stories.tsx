import type { Meta, StoryObj } from "@storybook/react-vite";
import { FooterSection } from ".";

const meta = {
  title: "Features/LandingPage/FooterSection",
  component: FooterSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FooterSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
