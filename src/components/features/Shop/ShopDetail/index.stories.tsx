import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ShopDetail, ShopDetailError, ShopDetailLoading, ShopDetailNotFound } from "./index";

const meta = {
  title: "features/Shop/ShopDetail",
  component: ShopDetail,
  args: {
    shop: {
      _id: "shop1" as Id<"shops">,
      _creationTime: Date.now(),
      shopName: "Crispy Carnival 本店",
      openTime: "10:00",
      closeTime: "22:00",
      timeUnit: 30,
      submitFrequency: "1w",
      avatar: "",
      description: "東京・渋谷にあるポップコーン専門店です。こだわりのフレーバーを多数取り揃えています。",
      createdBy: "auth1",
      createdAt: Date.now(),
      isDeleted: false,
    } as Doc<"shops">,
  },
} satisfies Meta<typeof ShopDetail>;

export default meta;

export const Basic: StoryObj<typeof meta> = {};

export const Loading: StoryObj<typeof meta> = {
  render: () => <ShopDetailLoading />,
};

export const NotFound: StoryObj<typeof meta> = {
  render: () => <ShopDetailNotFound />,
};

export const ErrorPattern: StoryObj<typeof meta> = {
  render: () => <ShopDetailError />,
};
