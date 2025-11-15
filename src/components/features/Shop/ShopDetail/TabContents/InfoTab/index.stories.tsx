import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { InfoTab } from ".";

const meta: Meta<typeof InfoTab> = {
  component: InfoTab,
  title: "Features/Shop/ShopDetail/TabContents/InfoTab",
};

export default meta;

type Story = StoryObj<typeof InfoTab>;

export const Basic: Story = {
  args: {
    shop: {
      _id: "shop123" as Id<"shops">,
      _creationTime: Date.now(),
      shopName: "サンプル店舗",
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: 30,
      submitFrequency: "2w",
      useTimeCard: true,
      description: "店舗の詳細説明がここに入ります。営業に関する注意事項やルールなどを記載できます。",
      createdAt: Date.now(),
      isDeleted: false,
      createdBy: "user123",
    },
  },
};
