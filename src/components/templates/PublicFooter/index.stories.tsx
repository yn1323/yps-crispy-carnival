import type { Meta, StoryObj } from "@storybook/react-vite";
import { PublicFooter } from ".";

const meta = {
  title: "Shared/PublicFooter",
  component: PublicFooter,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PublicFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
