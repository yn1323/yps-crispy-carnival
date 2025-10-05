import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopsList } from "@/src/components/pages/Shops/List";

const meta = {
  title: "pages/Shops/List",
  component: ShopsList,
} satisfies Meta<typeof ShopsList>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
