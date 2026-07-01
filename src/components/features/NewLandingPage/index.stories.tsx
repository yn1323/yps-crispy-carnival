import type { Meta, StoryObj } from "@storybook/react-vite";
import { NewLandingPage } from ".";

const meta = {
  title: "Features/NewLandingPage",
  component: NewLandingPage,
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof NewLandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
