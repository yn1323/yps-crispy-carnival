import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { UserDetail, UserDetailLoading, UserDetailNotFound } from "./index";

const meta = {
  title: "Features/User/UserDetail",
  component: UserDetail,
  args: {
    user: {
      _id: "user1" as Id<"users">,
      _creationTime: Date.now(),
      name: "山田太郎",
      authId: "auth1",
      createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30日前
      isDeleted: false,
    } as Doc<"users">,
    shops: [
      {
        _id: "shop1" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 本店",
        openTime: "10:00",
        closeTime: "22:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: true,
        description: "東京・渋谷にあるポップコーン専門店です。",
        createdBy: "auth1",
        createdAt: Date.now(),
        isDeleted: false,
        role: "owner",
      },
      {
        _id: "shop2" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 新宿店",
        openTime: "11:00",
        closeTime: "21:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: true,
        createdBy: "auth2",
        createdAt: Date.now(),
        isDeleted: false,
        role: "manager",
      },
      {
        _id: "shop3" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 池袋店",
        openTime: "10:00",
        closeTime: "22:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: false,
        createdBy: "auth3",
        createdAt: Date.now(),
        isDeleted: false,
        role: "staff",
      },
    ],
    currentShopRole: "owner",
    currentShopId: "shop1" as Id<"shops">,
  },
} satisfies Meta<typeof UserDetail>;

export default meta;

export const Basic: StoryObj<typeof meta> = {};

export const AsManager: StoryObj<typeof meta> = {
  args: {
    currentShopRole: "manager",
  },
};

export const AsStaff: StoryObj<typeof meta> = {
  args: {
    currentShopRole: "staff",
  },
};

export const SingleShop: StoryObj<typeof meta> = {
  args: {
    shops: [
      {
        _id: "shop1" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 本店",
        openTime: "10:00",
        closeTime: "22:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: true,
        description: "東京・渋谷にあるポップコーン専門店です。",
        createdBy: "auth1",
        createdAt: Date.now(),
        isDeleted: false,
        role: "staff",
      },
    ],
    currentShopRole: "manager",
  },
};

export const MultipleRoles: StoryObj<typeof meta> = {
  args: {
    shops: [
      {
        _id: "shop1" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 本店",
        openTime: "10:00",
        closeTime: "22:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: true,
        description: "東京・渋谷にあるポップコーン専門店です。",
        createdBy: "auth1",
        createdAt: Date.now(),
        isDeleted: false,
        role: "owner",
      },
      {
        _id: "shop1" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 本店",
        openTime: "10:00",
        closeTime: "22:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: true,
        description: "東京・渋谷にあるポップコーン専門店です。",
        createdBy: "auth1",
        createdAt: Date.now(),
        isDeleted: false,
        role: "manager",
      },
      {
        _id: "shop2" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 新宿店",
        openTime: "11:00",
        closeTime: "21:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: true,
        createdBy: "auth2",
        createdAt: Date.now(),
        isDeleted: false,
        role: "manager",
      },
      {
        _id: "shop2" as Id<"shops">,
        _creationTime: Date.now(),
        shopName: "Crispy Carnival 新宿店",
        openTime: "11:00",
        closeTime: "21:00",
        timeUnit: 30,
        submitFrequency: "1w",
        avatar: "",
        useTimeCard: true,
        createdBy: "auth2",
        createdAt: Date.now(),
        isDeleted: false,
        role: "staff",
      },
    ],
    currentShopRole: "owner",
  },
};

export const NoShops: StoryObj<typeof meta> = {
  args: {
    shops: [],
    currentShopRole: null,
  },
};

export const Loading: StoryObj<typeof meta> = {
  render: () => <UserDetailLoading />,
};

export const NotFound: StoryObj<typeof meta> = {
  render: () => <UserDetailNotFound />,
};
