import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopsListPage } from "@/src/components/pages/Shops/ListPage";

const meta = {
  title: "pages/Shops/ListPage",
  component: ShopsListPage,
} satisfies Meta<typeof ShopsListPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
