import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopsDetailPage } from "@/src/components/pages/Shops/DetailPage";

const meta = {
  title: "pages/Shops/ShopsDetailPage",
  component: ShopsDetailPage,
} satisfies Meta<typeof ShopsDetailPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
