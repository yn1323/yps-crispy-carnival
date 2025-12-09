import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopSetting } from "./index";

const meta = {
  title: "features/Setting/UserSetting/ShopSetting",
  component: ShopSetting,
  args: {
    storeName: "本店",
    templateCount: 3,
  },
} satisfies Meta<typeof ShopSetting>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
