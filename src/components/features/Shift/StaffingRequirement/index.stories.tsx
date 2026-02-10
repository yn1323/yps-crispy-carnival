import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffingRequirement } from "./index";

// 共通のモック
const defaultShop = {
  _id: "shop_1",
  shopName: "カフェ サンプル店",
  openTime: "09:00",
  closeTime: "23:00",
};

const defaultPositions = [
  { _id: "pos_1", name: "ホール" },
  { _id: "pos_2", name: "キッチン" },
  { _id: "pos_3", name: "レジ" },
];

// 1日分のstaffingを生成するヘルパー
const generateDayStaffing = (dayOfWeek: number, pattern: "weekday" | "weekend") => {
  const hours = Array.from({ length: 14 }, (_, i) => i + 9); // 9:00-22:00
  const positions = ["ホール", "キッチン", "レジ"];

  // 時間帯別の人数パターン
  const weekdayPattern: Record<string, number[]> = {
    ホール: [1, 1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, 1],
    キッチン: [1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1],
    レジ: [1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 1, 1, 1, 0],
  };
  const weekendPattern: Record<string, number[]> = {
    ホール: [2, 2, 3, 4, 4, 3, 2, 2, 3, 4, 4, 3, 2, 1],
    キッチン: [1, 2, 3, 3, 3, 2, 2, 2, 3, 3, 3, 2, 1, 1],
    レジ: [1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 1],
  };

  const counts = pattern === "weekday" ? weekdayPattern : weekendPattern;

  return hours.flatMap((hour, i) =>
    positions.map((position) => ({
      _id: `${dayOfWeek}-${hour}-${position}`,
      shopId: "shop_1",
      dayOfWeek,
      hour,
      position,
      requiredCount: counts[position]?.[i] ?? 0,
    })),
  );
};

// 全曜日分のデータ（月〜金: weekday, 土日: weekend）
const fullWeekStaffing = [
  ...generateDayStaffing(1, "weekday"), // 月
  ...generateDayStaffing(2, "weekday"), // 火
  ...generateDayStaffing(3, "weekday"), // 水
  ...generateDayStaffing(4, "weekday"), // 木
  ...generateDayStaffing(5, "weekday"), // 金
  ...generateDayStaffing(6, "weekend"), // 土
  ...generateDayStaffing(0, "weekend"), // 日
  ...generateDayStaffing(7, "weekend"), // 祝
];

// 月曜だけデータありのパターン
const partialStaffing = generateDayStaffing(1, "weekday");

const meta = {
  title: "features/Shift/StaffingRequirement",
  component: StaffingRequirement,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    shopId: "shop_1",
    shop: defaultShop,
    positions: defaultPositions,
    onSave: async () => {},
    onCopy: async () => {},
  },
} satisfies Meta<typeof StaffingRequirement>;

export default meta;
type Story = StoryObj<typeof meta>;

// 全曜日データあり（メインのレイアウト確認用）
export const Basic: Story = {
  args: {
    initialStaffing: fullWeekStaffing,
    onResetSetup: () => {},
  },
};

// データなし（空状態の確認）
export const Empty: Story = {
  args: {
    initialStaffing: [],
  },
};

// 一部の曜日のみ設定済み
export const PartialData: Story = {
  args: {
    initialStaffing: partialStaffing,
    onResetSetup: () => {},
  },
};

// 短時間営業
export const ShortHours: Story = {
  args: {
    shop: {
      _id: "shop_1",
      shopName: "ランチ専門店",
      openTime: "11:00",
      closeTime: "15:00",
    },
    positions: [
      { _id: "pos_1", name: "ホール" },
      { _id: "pos_2", name: "キッチン" },
    ],
    initialStaffing: generateDayStaffing(1, "weekday").filter(
      (s) => s.hour >= 11 && s.hour < 15 && s.position !== "レジ",
    ),
  },
};

// SP: 日別モード（メイン確認）
export const MobileDaily: Story = {
  args: {
    initialStaffing: fullWeekStaffing,
    onResetSetup: () => {},
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

// SP: 空状態（Wizard表示）
export const MobileEmpty: Story = {
  args: {
    initialStaffing: [],
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

// SP: 一部設定済み
export const MobilePartial: Story = {
  args: {
    initialStaffing: partialStaffing,
    onResetSetup: () => {},
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
