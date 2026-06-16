import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticlePreviewSection } from ".";

const meta = {
  title: "Features/LandingPage/ArticlePreviewSection",
  component: ArticlePreviewSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ArticlePreviewSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
