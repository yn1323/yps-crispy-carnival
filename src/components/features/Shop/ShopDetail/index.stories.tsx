import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopDetail } from "@/src/components/features/Shop/ShopDetail";

const meta = {
  title: "features/Shop/ShopDetail",
  component: ShopDetail,
} satisfies Meta<typeof ShopDetail>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
