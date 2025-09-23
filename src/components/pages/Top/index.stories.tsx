import type { Meta, StoryObj } from "@storybook/react-vite";
import { Top } from "@/src/components/pages/Top";

const meta = {
  title: "pages/Top",
  component: Top,
} satisfies Meta<typeof Top>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
