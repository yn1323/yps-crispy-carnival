import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopsNew } from "@/src/components/pages/Shops/New";

const meta = {
  title: "pages/Shops/New",
  component: ShopsNew,
} satisfies Meta<typeof ShopsNew>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
