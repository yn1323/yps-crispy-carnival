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
      useTimeCard: true,
      description: "東京・渋谷にあるポップコーン専門店です。こだわりのフレーバーを多数取り揃えています。",
      createdBy: "auth1",
      createdAt: Date.now(),
      isDeleted: false,
    } as Doc<"shops">,
    users: [
      {
        _id: "user1" as Id<"users">,
        name: "山田太郎",
        authId: "auth1",
        role: "owner",
        createdAt: Date.now(),
      },
      {
        _id: "user2" as Id<"users">,
        name: "佐藤花子",
        authId: "auth2",
        role: "manager",
        createdAt: Date.now(),
      },
      {
        _id: "user3" as Id<"users">,
        name: "鈴木一郎",
        authId: "auth3",
        role: "staff",
        createdAt: Date.now(),
      },
    ],
    userRole: "owner",
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
