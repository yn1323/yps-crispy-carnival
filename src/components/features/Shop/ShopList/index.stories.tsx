import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopList, ShopListEmpty } from "@/src/components/features/Shop/ShopList";

const meta = {
  title: "features/Shop/ShopList",
  component: ShopList,
  args: {
    canCreateShop: true,
    shops: [
      {
        _id: "shop1",
        shopName: "Crispy Carnival",
        openTime: "10:00",
        closeTime: "20:00",
        submitFrequency: "1w",
        staffCount: 8,
      },
      {
        _id: "shop2",
        shopName: "Crispy Carnival2",
        openTime: "10:00",
        closeTime: "20:00",
        submitFrequency: "1w",
        staffCount: 12,
      },
    ],
  },
} satisfies Meta<typeof ShopList>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};

export const CannotCreateShop: StoryObj<typeof meta> = {
  args: {
    canCreateShop: false,
  },
};

export const Empty: StoryObj<typeof meta> = {
  render: () => <ShopListEmpty />,
};
