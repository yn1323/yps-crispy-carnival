import type { Meta, StoryObj } from "@storybook/react-vite";
import { CacheResetPage } from ".";

const meta = {
  title: "Pages/CacheReset",
  component: CacheResetPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CacheResetPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
