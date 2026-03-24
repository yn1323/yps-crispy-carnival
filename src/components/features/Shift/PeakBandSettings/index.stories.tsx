import type { Meta, StoryObj } from "@storybook/react-vite";
import { withDummyRouter } from "../../../../../.storybook/withDummyRouter";
import type { InitialDayData } from "./index";
import { PeakBandSettings } from "./index";

const meta = {
  title: "features/Shift/PeakBandSettings",
  component: PeakBandSettings,
  decorators: [withDummyRouter("/")],
  parameters: {
    layout: "padded",
  },
  args: {
    shopId: "shop-1",
    shopName: "渋谷センター店",
    onSave: async (params) => {
      console.log("onSave called:", params);
    },
    isSaving: false,
  },
} satisfies Meta<typeof PeakBandSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// 空の状態
export const Default: Story = {};

// かんたんモード（初期データあり）
const simpleInitialData: InitialDayData[] = [
  // 平日（月〜金）は同じ設定
  ...[1, 2, 3, 4, 5].map((day) => ({
    dayOfWeek: day,
    peakBands: [
      { startTime: "11:00", endTime: "14:00", requiredCount: 3 },
      { startTime: "17:00", endTime: "21:00", requiredCount: 4 },
    ],
    minimumStaff: 2,
  })),
  // 休日（日,土,祝）は同じ設定
  ...[0, 6, 7].map((day) => ({
    dayOfWeek: day,
    peakBands: [
      { startTime: "11:00", endTime: "14:00", requiredCount: 4 },
      { startTime: "17:00", endTime: "21:00", requiredCount: 5 },
    ],
    minimumStaff: 3,
  })),
];

export const SimpleMode: Story = {
  args: {
    initialData: simpleInitialData,
  },
};

// 詳細モード（曜日ごとに異なる設定）
const detailedInitialData: InitialDayData[] = [
  {
    dayOfWeek: 1,
    peakBands: [{ startTime: "11:00", endTime: "14:00", requiredCount: 3 }],
    minimumStaff: 2,
  },
  {
    dayOfWeek: 5,
    peakBands: [
      { startTime: "11:00", endTime: "14:00", requiredCount: 4 },
      { startTime: "17:00", endTime: "22:00", requiredCount: 5 },
    ],
    minimumStaff: 2,
  },
];

export const DetailedMode: Story = {
  args: {
    initialData: detailedInitialData,
  },
};

// 保存中
export const Saving: Story = {
  args: {
    initialData: simpleInitialData,
    isSaving: true,
  },
};
