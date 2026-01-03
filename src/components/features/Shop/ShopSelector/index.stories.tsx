import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopSelector } from "./index";

const mockShops = [
  { _id: "shop1", shopName: "本店" },
  { _id: "shop2", shopName: "駅前店" },
  { _id: "shop3", shopName: "ショッピングモール店" },
];

const meta = {
  title: "features/Shop/ShopSelector",
  component: ShopSelector,
  args: {
    shops: mockShops,
    selectedShopId: "shop1",
    onShopChange: (shop) => console.log("Selected:", shop),
  },
} satisfies Meta<typeof ShopSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const NoSelection: Story = {
  args: {
    selectedShopId: null,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const SingleShop: Story = {
  args: {
    shops: [{ _id: "shop1", shopName: "本店" }],
  },
};
