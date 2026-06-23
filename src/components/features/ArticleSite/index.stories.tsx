import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticlePage } from ".";

const meta = {
  title: "Features/ArticleSite/ArticlePage",
  component: ArticlePage,
  args: {
    slug: "line-shift-collection-guide",
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ArticlePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
