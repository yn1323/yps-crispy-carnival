import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffingMatrix } from "./index";

const meta = {
  title: "features/Shift/StaffingMatrix",
  component: StaffingMatrix,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof StaffingMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shopId: "shop_1",
    shop: {
      _id: "shop_1",
      shopName: "サンプル店舗",
      openTime: "09:00",
      closeTime: "22:00",
    },
    positions: [
      { _id: "pos_1", name: "ホール" },
      { _id: "pos_2", name: "キッチン" },
      { _id: "pos_3", name: "その他" },
    ],
    initialStaffing: [],
  },
};

export const WithData: Story = {
  args: {
    shopId: "shop_1",
    shop: {
      _id: "shop_1",
      shopName: "サンプル店舗",
      openTime: "09:00",
      closeTime: "22:00",
    },
    positions: [
      { _id: "pos_1", name: "ホール" },
      { _id: "pos_2", name: "キッチン" },
    ],
    initialStaffing: [
      { _id: "1", shopId: "shop_1", dayOfWeek: 1, hour: 9, position: "ホール", requiredCount: 2 },
      { _id: "2", shopId: "shop_1", dayOfWeek: 1, hour: 9, position: "キッチン", requiredCount: 1 },
      { _id: "3", shopId: "shop_1", dayOfWeek: 1, hour: 10, position: "ホール", requiredCount: 2 },
      { _id: "4", shopId: "shop_1", dayOfWeek: 1, hour: 10, position: "キッチン", requiredCount: 1 },
      { _id: "5", shopId: "shop_1", dayOfWeek: 1, hour: 11, position: "ホール", requiredCount: 3 },
      { _id: "6", shopId: "shop_1", dayOfWeek: 1, hour: 11, position: "キッチン", requiredCount: 2 },
      { _id: "7", shopId: "shop_1", dayOfWeek: 1, hour: 12, position: "ホール", requiredCount: 3 },
      { _id: "8", shopId: "shop_1", dayOfWeek: 1, hour: 12, position: "キッチン", requiredCount: 2 },
    ],
  },
};

export const ShortHours: Story = {
  args: {
    shopId: "shop_1",
    shop: {
      _id: "shop_1",
      shopName: "短時間営業店舗",
      openTime: "11:00",
      closeTime: "15:00",
    },
    positions: [
      { _id: "pos_1", name: "ホール" },
      { _id: "pos_2", name: "キッチン" },
    ],
    initialStaffing: [],
  },
};
