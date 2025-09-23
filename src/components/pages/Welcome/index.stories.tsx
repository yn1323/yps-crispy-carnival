import type { Meta, StoryObj } from "@storybook/react-vite";
import { Welcome } from "@/src/components/pages/Welcome";

const meta = {
  title: "pages/Welcome",
  component: Welcome,
} satisfies Meta<typeof Welcome>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
