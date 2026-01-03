import type { Meta, StoryObj } from "@storybook/react-vite";
import { SideMenu } from "./index";

const mockShops = [
  { _id: "shop1", shopName: "本店" },
  { _id: "shop2", shopName: "駅前店" },
  { _id: "shop3", shopName: "ショッピングモール店" },
];

const meta = {
  title: "templates/SideMenu",
  component: SideMenu,
  args: {
    shops: mockShops,
    selectedShopId: "shop1",
    onShopChange: (shop) => console.log("Selected:", shop),
  },
} satisfies Meta<typeof SideMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const NoShopSelected: Story = {
  args: {
    selectedShopId: null,
  },
};

export const OnlyLogout: Story = {
  args: {
    onlyLogout: true,
  },
};
