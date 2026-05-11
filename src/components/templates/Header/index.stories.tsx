import type { Meta, StoryObj } from "@storybook/react-vite";
import { Header } from "./index";

const meta = {
  title: "templates/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const User: Story = {};

export const Public: Story = {
  args: {
    variant: "public",
  },
};

export const PublicBrandOnly: Story = {
  args: {
    variant: "public",
    showLinks: false,
    showLogin: false,
  },
};

export const Staff: Story = {
  args: {
    variant: "staff",
    shopName: "居酒屋さくら",
    maxW: "1024px",
    px: { base: 4, lg: 6 },
  },
};

export const Mobile: Story = {
  args: {
    variant: "public",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
