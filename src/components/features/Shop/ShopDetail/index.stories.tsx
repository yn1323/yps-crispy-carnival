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
    staffs: [
      {
        _id: "staff1" as Id<"staffs">,
        email: "yamada@example.com",
        displayName: "山田太郎",
        status: "active",
        skills: [
          { position: "ホール", level: "ベテラン" },
          { position: "キッチン", level: "一人前" },
        ],
        maxWeeklyHours: 40,
        createdAt: Date.now(),
      },
      {
        _id: "staff2" as Id<"staffs">,
        email: "sato@example.com",
        displayName: "佐藤花子",
        status: "active",
        skills: [{ position: "レジ", level: "研修中" }],
        maxWeeklyHours: 20,
        createdAt: Date.now(),
      },
      {
        _id: "staff3" as Id<"staffs">,
        email: "suzuki@example.com",
        displayName: "鈴木一郎",
        status: "pending",
        skills: [],
        maxWeeklyHours: undefined,
        createdAt: Date.now(),
      },
    ],
    isOwner: true,
  },
} satisfies Meta<typeof ShopDetail>;

export default meta;

export const Basic: StoryObj<typeof meta> = {};

export const AsNonOwner: StoryObj<typeof meta> = {
  args: {
    isOwner: false,
  },
};

export const Loading: StoryObj<typeof meta> = {
  args: {
    staffs: [],
    isOwner: false,
  },
  render: () => <ShopDetailLoading />,
};

export const NotFound: StoryObj<typeof meta> = {
  args: {
    staffs: [],
    isOwner: false,
  },
  render: () => <ShopDetailNotFound />,
};

export const ErrorPattern: StoryObj<typeof meta> = {
  args: {
    staffs: [],
    isOwner: false,
  },
  render: () => <ShopDetailError />,
};
