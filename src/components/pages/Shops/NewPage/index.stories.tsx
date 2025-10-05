import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopsNewPage } from "@/src/components/pages/Shops/NewPage";

const meta = {
  title: "pages/Shops/NewPage",
  component: ShopsNewPage,
} satisfies Meta<typeof ShopsNewPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
