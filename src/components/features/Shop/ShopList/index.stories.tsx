import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopList, ShopListEmpty } from "@/src/components/features/Shop/ShopList";

const meta = {
  title: "features/Shop/ShopList",
  component: ShopList,
  args: {
    shops: [
      {
        _id: "shop1",
        shopName: "Crispy Carnival",
        openTime: "10:00",
        closeTime: "20:00",
        submitFrequency: "1w",
        useTimeCard: true,
      },
      {
        _id: "shop2",
        shopName: "Crispy Carnival2",
        openTime: "10:00",
        closeTime: "20:00",
        submitFrequency: "1w",
        useTimeCard: false,
      },
    ],
  },
} satisfies Meta<typeof ShopList>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};

export const Empty: StoryObj<typeof meta> = {
  render: () => <ShopListEmpty />,
};
