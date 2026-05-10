import type { Meta, StoryObj } from "@storybook/react-vite";
import { FaqPage } from ".";

const meta = {
  title: "Pages/FaqPage",
  component: FaqPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FaqPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
