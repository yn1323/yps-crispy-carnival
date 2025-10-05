import type { Meta, StoryObj } from "@storybook/react-vite";
import { TopPage } from "@/src/components/pages/TopPage";

const meta = {
  title: "pages/TopPage",
  component: TopPage,
} satisfies Meta<typeof TopPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
