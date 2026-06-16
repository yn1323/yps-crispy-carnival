import type { Meta, StoryObj } from "@storybook/react-vite";
import { FeaturesPage } from ".";

const meta = {
  title: "Pages/FeaturesPage",
  component: FeaturesPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FeaturesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};
