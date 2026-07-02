import type { Meta, StoryObj } from "@storybook/react-vite";
import { FaqArticlesSection } from ".";

const meta = {
  title: "Features/LandingPage/FaqArticlesSection",
  component: FaqArticlesSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FaqArticlesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
