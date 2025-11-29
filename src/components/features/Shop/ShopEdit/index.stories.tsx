import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopEdit } from ".";

const meta = {
  title: "Features/Shop/ShopEdit",
  component: ShopEdit,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ShopEdit>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shop: {
      _id: "shop123" as Id<"shops">,
      _creationTime: Date.now(),
      shopName: "カフェサンプル",
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: 30,
      submitFrequency: "2w",
      avatar: "",
      description: "レジ締め時の注意点、特別な清掃ルール、緊急時の連絡先など",
      createdBy: "user123",
      createdAt: Date.now(),
      isDeleted: false,
    },
    isOwner: true,
  },
};

export const NotOwner: Story = {
  args: {
    shop: {
      _id: "shop123" as Id<"shops">,
      _creationTime: Date.now(),
      shopName: "カフェサンプル",
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: 30,
      submitFrequency: "2w",
      avatar: "",
      description: "レジ締め時の注意点、特別な清掃ルール、緊急時の連絡先など",
      createdBy: "user123",
      createdAt: Date.now(),
      isDeleted: false,
    },
    isOwner: false,
  },
};
