import type { Meta, StoryObj } from "@storybook/react-vite";
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
      _id: "shop123" as any,
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

export const WithoutTimeCard: Story = {
  args: {
    shop: {
      _id: "shop456" as any,
      _creationTime: Date.now(),
      shopName: "タイムカード未使用店舗",
      openTime: "10:00",
      closeTime: "20:00",
      timeUnit: 15,
      submitFrequency: "1w",
      useTimeCard: false,
      description: undefined,
      createdAt: Date.now(),
      isDeleted: false,
      createdBy: "user456",
    },
  },
};

export const WithLongDescription: Story = {
  args: {
    shop: {
      _id: "shop789" as any,
      _creationTime: Date.now(),
      shopName: "長い説明のある店舗",
      openTime: "08:00",
      closeTime: "23:00",
      timeUnit: 30,
      submitFrequency: "1m",
      useTimeCard: true,
      description:
        "この店舗は非常に詳細な説明文を持っています。営業時間の注意事項、シフト提出に関するルール、タイムカードの利用方法、緊急時の連絡先、その他の重要な情報が含まれています。スタッフは必ずこの説明を読んで理解してください。",
      createdAt: Date.now(),
      isDeleted: false,
      createdBy: "user789",
    },
  },
};
