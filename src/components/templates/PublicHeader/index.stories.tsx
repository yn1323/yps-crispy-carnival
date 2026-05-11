import type { Meta, StoryObj } from "@storybook/react-vite";
import { PublicHeader } from "./index";

const meta = {
  title: "templates/PublicHeader",
  component: PublicHeader,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PublicHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const BrandOnly: Story = {
  args: {
    showLinks: false,
    showLogin: false,
  },
};

export const Mobile: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
