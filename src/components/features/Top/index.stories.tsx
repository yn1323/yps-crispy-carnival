import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Top } from ".";

const meta = {
  title: "features/Top",
  component: Top,
} satisfies Meta<typeof Top>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
